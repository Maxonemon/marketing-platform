import type { Execution, ExecutionStatus, ProposedAction } from "@/generated/prisma/client";
import { appendActivity } from "@/lib/app/activity-log";
import { lockApproval, type StartExecution } from "@/lib/app/approvals";
import { notifyTeam } from "@/lib/app/notifications";
import {
  NotDeliveredError,
  type ChannelAdapter,
  type ChannelAdapters,
  type Delivery,
  type DeliveryResult,
} from "@/lib/channels/channel-adapter";
import { systemClock, type Clock } from "@/lib/clock";
import { db } from "@/lib/db";
import type { Notifier } from "@/lib/notifications/notifier";
import { verifyPayload } from "./proposed-action-payload";

export type ExecutionRefusal =
  // No such Approval.
  | "NOT_FOUND"
  // Pending, Rejected, Expired or Superseded: only an Approved Proposed Action executes.
  | "NOT_APPROVED"
  // The stored payload no longer matches the hash it was proposed and approved with.
  | "PAYLOAD_CHANGED"
  // An attempt succeeded, so it went out: nothing is sent again (e.g. a duplicate event).
  | "ALREADY_SUCCEEDED"
  // Another run's attempt is going out right now.
  | "IN_PROGRESS"
  // An attempt may have gone out; only a person checking the Channel can tell.
  | "MAY_HAVE_BEEN_DELIVERED"
  // Every attempt was made and failed.
  | "NO_ATTEMPTS_LEFT";

export type ExecutionOutcome =
  | { status: "SUCCEEDED"; executionId: string }
  // Nothing went out. `willRetry` is false after the last attempt.
  | { status: "FAILED"; executionId: string; willRetry: boolean }
  // It may have gone out, so it is never retried.
  | { status: "UNCERTAIN"; executionId: string }
  | { status: "REFUSED"; reason: ExecutionRefusal };

// An Approval gets at most this many attempts, however many runs start them.
export const MAX_EXECUTION_ATTEMPTS = 3;

// What a failed attempt records and logs. Never the Channel's own error, which could
// carry credentials once real Integrations exist.
export const DELIVERY_FAILED = "The Channel couldn't deliver it.";
export const DELIVERY_UNCERTAIN =
  "The Channel failed without saying whether it was delivered, so it is not retried. Check the Channel.";

export const ATTEMPT_ABANDONED = "The attempt never finished, so it may have gone out and is not retried. Check the Channel.";

// The reconcile sweep starts an Approved Approval that nothing is running this long after
// the decision and its last failed attempt (its own event or retry should have run by then)...
export const EXECUTION_START_GRACE_MINUTES = 5;
// ...and takes an attempt still STARTED this long after it began as abandoned.
export const STALE_ATTEMPT_MINUTES = 15;

// One run of the reconcile sweep handles at most this many of each.
const RECONCILE_BATCH_SIZE = 500;

const MINUTE_MS = 60 * 1000;

// Shared by every attempt for the same Approval, so a Channel can recognise a repeat.
function idempotencyKeyFor(approvalId: string): string {
  return `approval:${approvalId}`;
}

// The only code that executes a Proposed Action; the background function calls it with
// the Approval's id, once per try. Immediately before calling the Channel it re-reads
// the Approval and its Proposed Action, refuses unless the Approval is APPROVED, the
// recomputed payload hash matches the stored one and another attempt is allowed, and
// records the attempt. Only the re-validated payload is sent, never the raw stored JSON.
// A failure is recorded and returned, never thrown, so the Channel's error goes nowhere.
// A final failure is reported to the team through `notifier`, after it commits.
export async function executeApproval(
  approvalId: string,
  channels: ChannelAdapters,
  notifier?: Notifier,
): Promise<ExecutionOutcome> {
  const claim = await claimAttempt(approvalId);
  if (typeof claim === "string") return refused(claim);
  const delivered = await deliver(channels[claim.delivery.payload.channel], claim.delivery);
  const { outcome, failedFinally } = await recordAttempt(claim, delivered);
  if (failedFinally && notifier) await notifyTeam(notifier, { kind: "EXECUTION_FAILED", approvalId });
  return outcome;
}

interface Claim {
  execution: Execution;
  proposedAction: ProposedAction;
  delivery: Delivery;
}

// Checks the Approval and its attempts, and records the next attempt, in one transaction
// that holds the Approval's row lock, so no status change or other claim can land between
// the check and the claim. A supersede takes the same lock (src/lib/app/content-assets.ts):
// it either commits first and is seen here, or waits and then finds this attempt.
function claimAttempt(approvalId: string): Promise<Claim | ExecutionRefusal> {
  return db.$transaction(async (tx) => {
    if (!(await lockApproval(tx, approvalId))) return "NOT_FOUND";
    // Read after the lock, so it sees any change that committed while this waited.
    const approval = await tx.approval.findUniqueOrThrow({
      where: { id: approvalId },
      include: { proposedAction: true, executions: { select: { status: true } } },
    });
    if (approval.status !== "APPROVED") return "NOT_APPROVED";
    const refusal = attemptRefusal(approval.executions);
    if (refusal) return refusal;
    const { proposedAction } = approval;
    const payload = verifyPayload(proposedAction.payload, proposedAction.payloadHash);
    if (!payload) return "PAYLOAD_CHANGED";
    const attempt = approval.executions.length + 1;
    const delivery: Delivery = { idempotencyKey: idempotencyKeyFor(approvalId), attempt, payload };
    const execution = await tx.execution.create({
      data: { approvalId, idempotencyKey: delivery.idempotencyKey, attempt },
    });
    return { execution, proposedAction, delivery };
  });
}

// Another attempt is allowed only after failures that sent nothing, and only while
// attempts remain.
function attemptRefusal(executions: readonly { status: ExecutionStatus }[]): ExecutionRefusal | null {
  const statuses = new Set(executions.map(({ status }) => status));
  if (statuses.has("SUCCEEDED")) return "ALREADY_SUCCEEDED";
  if (statuses.has("STARTED")) return "IN_PROGRESS";
  if (statuses.has("UNCERTAIN")) return "MAY_HAVE_BEEN_DELIVERED";
  if (executions.length >= MAX_EXECUTION_ATTEMPTS) return "NO_ATTEMPTS_LEFT";
  return null;
}

function refused(reason: ExecutionRefusal): ExecutionOutcome {
  return { status: "REFUSED", reason };
}

type DeliveryAttempt = { status: "SUCCEEDED"; result: DeliveryResult } | { status: "FAILED" | "UNCERTAIN" };

// Only NotDeliveredError means nothing went out; any other error may have come after
// delivering. The error itself is dropped here.
async function deliver(channel: ChannelAdapter, delivery: Delivery): Promise<DeliveryAttempt> {
  try {
    return { status: "SUCCEEDED", result: await channel.deliver(delivery) };
  } catch (error: unknown) {
    return { status: error instanceof NotDeliveredError ? "FAILED" : "UNCERTAIN" };
  }
}

interface RecordedAttempt {
  outcome: ExecutionOutcome;
  // True when this call logged a failure that no retry follows.
  failedFinally: boolean;
}

// Finishes the attempt and logs it with the system as the actor, in one transaction. A
// failure is final after the last attempt, and always when it may have gone out.
// A delivery so slow that the reconcile sweep already marked it UNCERTAIN keeps that mark
// and its log entry, unless it succeeded: a known success is recorded over it. A late
// failure never turns it back into a retryable FAILED.
function recordAttempt({ execution, proposedAction, delivery }: Claim, delivered: DeliveryAttempt): Promise<RecordedAttempt> {
  const { id: executionId, approvalId, attempt } = execution;
  const entry = { workspaceId: proposedAction.workspaceId, actor: "system", brandId: proposedAction.brandId, approvalId } as const;
  const finishedAt = new Date();
  return db.$transaction(async (tx): Promise<RecordedAttempt> => {
    if (delivered.status === "SUCCEEDED") {
      await tx.execution.updateMany({
        where: { id: executionId, status: { in: ["STARTED", "UNCERTAIN"] } },
        data: { status: "SUCCEEDED", result: delivered.result, finishedAt },
      });
      const details = { channel: delivery.payload.channel, attempt };
      await appendActivity(tx, { ...entry, event: "EXECUTION_SUCCEEDED", details });
      return { outcome: { status: "SUCCEEDED", executionId }, failedFinally: false };
    }
    const isUncertain = delivered.status === "UNCERTAIN";
    const error = isUncertain ? DELIVERY_UNCERTAIN : DELIVERY_FAILED;
    const willRetry = !isUncertain && attempt < MAX_EXECUTION_ATTEMPTS;
    const finished = await tx.execution.updateMany({
      where: { id: executionId, status: "STARTED" },
      data: { status: delivered.status, error, finishedAt },
    });
    if (finished.count === 0) return { outcome: { status: "UNCERTAIN", executionId }, failedFinally: false };
    await appendActivity(tx, { ...entry, event: "EXECUTION_FAILED", details: { attempt, error, final: !willRetry } });
    const outcome: ExecutionOutcome = isUncertain
      ? { status: "UNCERTAIN", executionId }
      : { status: "FAILED", executionId, willRetry };
    return { outcome, failedFinally: !willRetry };
  });
}

export interface ReconcileOutcome {
  started: number;
  // Approvals whose event couldn't be sent this run; the next run tries again.
  failedToStart: number;
  markedUncertain: number;
}

// The reconcile sweep, run by a periodic background function. It starts the Execution
// of Approved Approvals that nothing is running: no attempt yet (approving committed but
// its event was never sent), or only failed attempts with attempts left whose retries
// stopped (e.g. the database was down for all of them). It also marks attempts left
// STARTED (the process died mid-delivery) as UNCERTAIN: they may have gone out, so they
// are never retried and the version stays locked against edits. Starting twice is
// harmless: each attempt is claimed under the Approval's lock, and attempts stay bounded.
// The two steps are independent: an event that can't be sent doesn't stop the marking.
// Each attempt it marks UNCERTAIN is a final failure, reported through `notifier`.
export async function reconcileExecutions(
  startExecution: StartExecution,
  clock: Clock = systemClock,
  notifier?: Notifier,
): Promise<ReconcileOutcome> {
  const now = clock.now().getTime();
  const quietSince = new Date(now - EXECUTION_START_GRACE_MINUTES * MINUTE_MS);
  const { started, failedToStart } = await startIdleExecutions(startExecution, quietSince);
  const markedUncertain = await markAbandonedAttempts(new Date(now - STALE_ATTEMPT_MINUTES * MINUTE_MS), notifier);
  return { started, failedToStart, markedUncertain };
}

// Approved before `quietSince`, with every attempt (if any) FAILED, below the last
// attempt and finished before `quietSince`. A send that throws is counted, not logged:
// its error could carry the event key.
async function startIdleExecutions(
  startExecution: StartExecution,
  quietSince: Date,
): Promise<Pick<ReconcileOutcome, "started" | "failedToStart">> {
  const idle = await db.approval.findMany({
    where: {
      status: "APPROVED",
      decidedAt: { lte: quietSince },
      executions: {
        none: { OR: [{ status: { not: "FAILED" } }, { attempt: { gte: MAX_EXECUTION_ATTEMPTS } }, { finishedAt: { gt: quietSince } }] },
      },
    },
    orderBy: { decidedAt: "asc" },
    take: RECONCILE_BATCH_SIZE,
    select: { id: true },
  });
  let started = 0;
  for (const { id } of idle) {
    try {
      await startExecution(id);
      started += 1;
    } catch {
      // Reported as failedToStart; the next run tries again.
    }
  }
  return { started, failedToStart: idle.length - started };
}

async function markAbandonedAttempts(startedBefore: Date, notifier?: Notifier): Promise<number> {
  const abandoned = await db.execution.findMany({
    where: { status: "STARTED", startedAt: { lte: startedBefore } },
    orderBy: { startedAt: "asc" },
    take: RECONCILE_BATCH_SIZE,
    include: { approval: { select: { proposedAction: { select: { workspaceId: true, brandId: true } } } } },
  });
  let markedUncertain = 0;
  for (const execution of abandoned) {
    if (!(await markAbandoned(execution, execution.approval.proposedAction))) continue;
    markedUncertain += 1;
    if (notifier) await notifyTeam(notifier, { kind: "EXECUTION_FAILED", approvalId: execution.approvalId });
  }
  return markedUncertain;
}

// Only if it is still STARTED, with its log entry: true when this call marked it. A
// delivery that does finish later records a success over this, never a failure.
function markAbandoned(execution: Execution, { workspaceId, brandId }: Pick<ProposedAction, "workspaceId" | "brandId">): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const marked = await tx.execution.updateMany({
      where: { id: execution.id, status: "STARTED" },
      data: { status: "UNCERTAIN", error: ATTEMPT_ABANDONED, finishedAt: new Date() },
    });
    if (marked.count === 0) return false;
    await appendActivity(tx, {
      workspaceId,
      actor: "system",
      brandId,
      approvalId: execution.approvalId,
      event: "EXECUTION_FAILED",
      details: { attempt: execution.attempt, error: ATTEMPT_ABANDONED, final: true },
    });
    return true;
  });
}
