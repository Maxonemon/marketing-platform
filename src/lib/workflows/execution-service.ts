import type { Execution, ExecutionStatus, ProposedAction } from "@/generated/prisma/client";
import { appendActivity } from "@/lib/app/activity-log";
import { lockApproval, type StartExecution } from "@/lib/app/approvals";
import {
  NotDeliveredError,
  type ChannelAdapter,
  type ChannelAdapters,
  type Delivery,
  type DeliveryResult,
} from "@/lib/channels/channel-adapter";
import { systemClock, type Clock } from "@/lib/clock";
import { db } from "@/lib/db";
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

// The reconcile sweep starts an Approved Approval with no attempt this long after the
// decision (its own event should have started it by then)...
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
export async function executeApproval(approvalId: string, channels: ChannelAdapters): Promise<ExecutionOutcome> {
  const claim = await claimAttempt(approvalId);
  if (typeof claim === "string") return refused(claim);
  const delivered = await deliver(channels[claim.delivery.payload.channel], claim.delivery);
  return recordAttempt(claim, delivered);
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

// Finishes the attempt and logs it with the system as the actor, in one transaction. A
// failure is final after the last attempt, and always when it may have gone out.
function recordAttempt({ execution, proposedAction, delivery }: Claim, delivered: DeliveryAttempt): Promise<ExecutionOutcome> {
  const { id: executionId, approvalId, attempt } = execution;
  const entry = { workspaceId: proposedAction.workspaceId, actor: "system", brandId: proposedAction.brandId, approvalId } as const;
  const finishedAt = new Date();
  return db.$transaction(async (tx): Promise<ExecutionOutcome> => {
    if (delivered.status === "SUCCEEDED") {
      await tx.execution.update({ where: { id: executionId }, data: { status: "SUCCEEDED", result: delivered.result, finishedAt } });
      const details = { channel: delivery.payload.channel, attempt };
      await appendActivity(tx, { ...entry, event: "EXECUTION_SUCCEEDED", details });
      return { status: "SUCCEEDED", executionId };
    }
    const isUncertain = delivered.status === "UNCERTAIN";
    const error = isUncertain ? DELIVERY_UNCERTAIN : DELIVERY_FAILED;
    const willRetry = !isUncertain && attempt < MAX_EXECUTION_ATTEMPTS;
    await tx.execution.update({ where: { id: executionId }, data: { status: delivered.status, error, finishedAt } });
    await appendActivity(tx, { ...entry, event: "EXECUTION_FAILED", details: { attempt, error, final: !willRetry } });
    return isUncertain ? { status: "UNCERTAIN", executionId } : { status: "FAILED", executionId, willRetry };
  });
}

export interface ReconcileOutcome {
  started: number;
  markedUncertain: number;
}

// The reconcile sweep, run by a periodic background function. It starts the Execution
// of Approved Approvals that have no attempt (approving committed but its event was never
// sent), and marks attempts left STARTED (the process died mid-delivery) as UNCERTAIN:
// they may have gone out, so they are never retried and the version stays locked against
// edits. Starting twice is harmless: each attempt is claimed under the Approval's lock.
export async function reconcileExecutions(startExecution: StartExecution, clock: Clock = systemClock): Promise<ReconcileOutcome> {
  const now = clock.now().getTime();
  const unstarted = await db.approval.findMany({
    where: { status: "APPROVED", decidedAt: { lte: new Date(now - EXECUTION_START_GRACE_MINUTES * MINUTE_MS) }, executions: { none: {} } },
    orderBy: { decidedAt: "asc" },
    take: RECONCILE_BATCH_SIZE,
    select: { id: true },
  });
  for (const { id } of unstarted) await startExecution(id);
  const abandoned = await db.execution.findMany({
    where: { status: "STARTED", startedAt: { lte: new Date(now - STALE_ATTEMPT_MINUTES * MINUTE_MS) } },
    orderBy: { startedAt: "asc" },
    take: RECONCILE_BATCH_SIZE,
    include: { approval: { select: { proposedAction: { select: { workspaceId: true, brandId: true } } } } },
  });
  let markedUncertain = 0;
  for (const execution of abandoned) {
    if (await markAbandoned(execution, execution.approval.proposedAction)) markedUncertain += 1;
  }
  return { started: unstarted.length, markedUncertain };
}

// Only if it is still STARTED, with its log entry: true when this call marked it. A
// delivery that does finish later still records its real result over this.
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
