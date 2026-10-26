import { z } from "zod";
import type { Approval, ApprovalStatus, ExecutionStatus, Prisma } from "@/generated/prisma/client";
import { systemClock, type Clock } from "@/lib/clock";
import { db, isUniqueViolation } from "@/lib/db";
import { APPROVAL_COMMENT_MAX_LENGTH } from "@/lib/limits";
import { requireRole, type Actor } from "@/lib/permissions";
import { hashPayload, verifyPayload, type ProposedActionPayload } from "@/lib/workflows/proposed-action-payload";
import { ruleViolationsSchema, type RuleViolation } from "@/lib/brand-rules";
import { appendActivity } from "./activity-log";
import { fail, ok, type Result } from "./result";
import { taskSummaryInclude, toTaskSummary, type TaskSummary } from "./tasks";
import { reviewVariantSelect, toReviewVariant, type ReviewVariant } from "./variants";

export interface ApprovalDetail {
  id: string;
  status: ApprovalStatus;
  decidedBy: string | null;
  decidedAt: Date | null;
  // Still PENDING after this, it is EXPIRED.
  expiresAt: Date;
  // The Approver's reason; always set on a REJECTED Approval.
  comment: string | null;
  // The Rejected Approval this one resubmits, and the Approval this one was resubmitted as.
  resubmissionOfId: string | null;
  resubmittedAsId: string | null;
  // The newer Approval this one was superseded by, and the older one this supersedes.
  supersededById: string | null;
  supersedesId: string | null;
  // Exactly what would be executed, and its hash.
  proposedAction: {
    id: string;
    // null when the stored payload fails its hash check: it will never be executed.
    payload: ProposedActionPayload | null;
    payloadHash: string;
    // The Brand rules its text broke when it was proposed: warnings, never a block.
    violations: RuleViolation[];
    createdBy: string;
    createdAt: Date;
  };
  // The Content Asset it was proposed from, as it is now; the payload is what was proposed.
  contentAsset: ReviewVariant;
  task: TaskSummary;
  executions: ExecutionSummary[];
}

export interface ExecutionSummary {
  id: string;
  attempt: number;
  status: ExecutionStatus;
  // What the Channel reported for a success, e.g. its delivery id.
  result: Prisma.JsonValue;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

// What to propose: a Content Asset as it is now (with the Brand rules its text breaks),
// who it reaches, and the Task it came from (its Brand, Channel and content type).
export interface Proposal {
  workspaceId: string;
  task: TaskSummary;
  contentAsset: Pick<ReviewVariant, "id" | "subject" | "body" | "violations">;
  audience: string | null;
  // The Rejected Approval this one resubmits.
  resubmissionOfId?: string;
}

// One entry in the approval queue.
export interface PendingApproval {
  id: string;
  submittedBy: string;
  submittedAt: Date;
  task: TaskSummary;
}

// A Pending Approval nobody decided this long after it was created is EXPIRED.
export const APPROVAL_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

// One run of the expiry sweep expires at most this many Approvals.
export const EXPIRY_SWEEP_BATCH_SIZE = 500;

// The approval queue shows this many of the oldest Pending Approvals.
export const APPROVAL_QUEUE_PAGE_SIZE = 100;

// Starts an Approval's background Execution: the app sends an Inngest event, tests record the call.
export type StartExecution = (approvalId: string) => Promise<void>;

export const APPROVAL_NOT_FOUND = "Approval not found.";
export const APPROVAL_ALREADY_DECIDED = "This Approval has already been decided.";
export const APPROVAL_EXPIRED = "Nobody decided this Approval within 7 days, so it expired. Submit the content again.";
const PAYLOAD_CHANGED = "This Proposed Action no longer matches its hash, so it can't be approved.";
const RESUBMITTED_PAYLOAD_CHANGED = "This Proposed Action no longer matches its hash, so it can't be resubmitted.";
const COMMENT_REQUIRED = "Tell the author what to change.";
const NOT_REJECTED = "Only a rejected Approval can be resubmitted.";
const ALREADY_RESUBMITTED = "This rejection has already been resubmitted.";

const rejectSchema = z.object({
  comment: z
    .string()
    .trim()
    .min(1, COMMENT_REQUIRED)
    .max(APPROVAL_COMMENT_MAX_LENGTH, `Use at most ${APPROVAL_COMMENT_MAX_LENGTH} characters.`),
});

export type RejectInput = z.input<typeof rejectSchema>;

const approvalDetailInclude = {
  decidedBy: { select: { name: true } },
  resubmittedAs: { select: { id: true } },
  supersedes: { select: { id: true } },
  executions: {
    select: { id: true, attempt: true, status: true, result: true, error: true, startedAt: true, finishedAt: true },
    orderBy: { attempt: "asc" },
  },
  proposedAction: {
    include: {
      createdBy: { select: { name: true } },
      contentAsset: { select: { ...reviewVariantSelect, task: { include: taskSummaryInclude } } },
    },
  },
} satisfies Prisma.ApprovalInclude;

// Approvals belong to the Workspace of their Proposed Action.
function inWorkspace(approvalId: string, workspaceId: string): Prisma.ApprovalWhereInput {
  return { id: approvalId, proposedAction: { workspaceId } };
}

// The one way to propose, in the caller's transaction: an immutable Proposed Action of
// the Content Asset (what would go out, where, to whom and when, with its hash), its
// Pending Approval and the PROPOSED_ACTION_SUBMITTED entry. It checks nothing itself:
// callers have passed requireRole and found the Task and Content Asset in the Workspace.
export async function proposeAction(tx: Prisma.TransactionClient, actor: Actor, proposal: Proposal): Promise<Approval> {
  const { workspaceId, task, contentAsset, resubmissionOfId } = proposal;
  const payload = payloadOf(proposal);
  const payloadHash = hashPayload(payload);
  const proposedAction = await tx.proposedAction.create({
    data: {
      workspaceId,
      brandId: task.brand.id,
      contentAssetId: contentAsset.id,
      createdById: actor.userId,
      payload,
      payloadHash,
      ruleViolations: contentAsset.violations,
    },
  });
  // The link is written as a plain foreign key, so a second resubmission breaks its
  // unique index. A nested connect would instead unlink the earlier resubmission.
  // Both times come from the same reading, so the deadline is exactly 7 days after creation.
  const createdAt = systemClock.now();
  const expiresAt = new Date(createdAt.getTime() + APPROVAL_LIFETIME_MS);
  const approval = await tx.approval.create({
    data: { proposedActionId: proposedAction.id, resubmissionOfId, createdAt, expiresAt },
  });
  await appendActivity(tx, {
    workspaceId,
    actor,
    brandId: task.brand.id,
    taskId: task.id,
    approvalId: approval.id,
    event: "PROPOSED_ACTION_SUBMITTED",
    details: { payloadHash },
  });
  return approval;
}

// Exactly what proposing would snapshot: the Task's Channel and content type, the
// Content Asset's text, the audience, and the timing.
export function payloadOf({ task, contentAsset, audience }: Pick<Proposal, "task" | "contentAsset" | "audience">): ProposedActionPayload {
  return {
    channel: task.input.channel,
    contentType: task.input.contentType,
    // A null subject is left out, so a payload without one hashes as it always has.
    content: { subject: contentAsset.subject ?? undefined, body: contentAsset.body },
    audience,
    timing: { kind: "AS_SOON_AS_APPROVED" },
  };
}

// Locks the Approval's row until the transaction ends; false when there is no such
// Approval. Claiming an Execution and editing both take this lock first, then read the
// Approval, so each sees the other's committed change; deciding waits for it too. NO KEY
// UPDATE, so rows that only reference the Approval (a resubmission at the same moment)
// aren't blocked by it, which would deadlock on the unique resubmission link.
export async function lockApproval(tx: Prisma.TransactionClient, approvalId: string): Promise<boolean> {
  const locked = await tx.$queryRaw<unknown[]>`SELECT 1 FROM "Approval" WHERE "id" = ${approvalId} FOR NO KEY UPDATE`;
  return locked.length === 1;
}

// A Pending Approval can be superseded, and so can an Approved one until an attempt
// starts: once it is going out, has gone out or may have gone out (STARTED, SUCCEEDED or
// UNCERTAIN), that version can't be replaced. A FAILED attempt sent nothing, so it
// doesn't count.
export function canBeSuperseded(status: ApprovalStatus, executions: readonly { status: ExecutionStatus }[]): boolean {
  if (status === "PENDING") return true;
  return status === "APPROVED" && executions.every((execution) => execution.status === "FAILED");
}

// What deciding needs to know about the Approval's Proposed Action.
function findToDecide(tx: Prisma.TransactionClient, workspaceId: string, approvalId: string) {
  return tx.approval.findFirst({
    where: inWorkspace(approvalId, workspaceId),
    include: { proposedAction: { select: { workspaceId: true, brandId: true, payload: true, payloadHash: true } } },
  });
}

// What expiring needs to know about an Approval.
interface ExpiryCandidate {
  id: string;
  status: ApprovalStatus;
  expiresAt: Date;
  proposedAction: { workspaceId: string; brandId: string; payloadHash: string };
}

// Moves a Pending Approval past its deadline to EXPIRED, only if it is still PENDING, and
// logs it with the system as the actor: true when this call expired it. EXPIRED is final.
// Like deciding, the update waits for any other status change of the row, then finds it
// no longer PENDING and changes nothing.
async function expireIfOverdue(tx: Prisma.TransactionClient, approval: ExpiryCandidate, now: Date): Promise<boolean> {
  if (approval.status !== "PENDING" || approval.expiresAt > now) return false;
  const expired = await tx.approval.updateMany({
    where: { id: approval.id, status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });
  if (expired.count === 0) return false;
  const { workspaceId, brandId, payloadHash } = approval.proposedAction;
  await appendActivity(tx, {
    workspaceId,
    actor: "system",
    brandId,
    approvalId: approval.id,
    event: "APPROVAL_EXPIRED",
    details: { payloadHash },
  });
  return true;
}

// An Approval past its deadline can't be decided. One still PENDING is expired here, so
// the refusal doesn't wait for the sweep; the caller's transaction commits the expiry.
async function isExpired(tx: Prisma.TransactionClient, approval: ExpiryCandidate, now: Date): Promise<boolean> {
  return approval.status === "EXPIRED" || (await expireIfOverdue(tx, approval, now));
}

type Decision = { status: "APPROVED" } | { status: "REJECTED"; comment: string };

// Moves the Approval from PENDING to the decision only if it is still PENDING and before
// its deadline. Of two decisions at the same moment, the second waits for the first's row
// lock, then finds the Approval no longer PENDING and changes nothing: false.
async function decideIfPending(
  tx: Prisma.TransactionClient,
  actor: Actor,
  approvalId: string,
  decision: Decision,
  now: Date,
): Promise<boolean> {
  const claimed = await tx.approval.updateMany({
    where: { id: approvalId, status: "PENDING", expiresAt: { gt: now } },
    data: { ...decision, decidedById: actor.userId, decidedAt: now },
  });
  return claimed.count === 1;
}

// Any member can read an Approval. Scoped by workspaceId, so another Workspace's
// Approval looks exactly like a missing one.
export async function getApproval(actor: Actor, workspaceId: string, approvalId: string): Promise<Result<ApprovalDetail>> {
  const access = await requireRole(actor, workspaceId, "MEMBER");
  if (!access.ok) return access;
  const row = await db.approval.findFirst({ where: inWorkspace(approvalId, workspaceId), include: approvalDetailInclude });
  if (!row) return fail("NOT_FOUND", APPROVAL_NOT_FOUND);
  const { proposedAction } = row;
  const { task, ...contentAsset } = proposedAction.contentAsset;
  return ok({
    id: row.id,
    status: row.status,
    decidedBy: row.decidedBy?.name ?? null,
    decidedAt: row.decidedAt,
    expiresAt: row.expiresAt,
    comment: row.comment,
    resubmissionOfId: row.resubmissionOfId,
    resubmittedAsId: row.resubmittedAs?.id ?? null,
    supersededById: row.supersededById,
    supersedesId: row.supersedes?.id ?? null,
    proposedAction: {
      id: proposedAction.id,
      payload: verifyPayload(proposedAction.payload, proposedAction.payloadHash),
      payloadHash: proposedAction.payloadHash,
      createdBy: proposedAction.createdBy.name,
      violations: ruleViolationsSchema.parse(proposedAction.ruleViolations),
      createdAt: proposedAction.createdAt,
    },
    contentAsset: toReviewVariant(contentAsset),
    task: toTaskSummary(task),
    executions: row.executions,
  });
}

// The approval queue: the Workspace's Pending Approvals, oldest first so that nothing
// waits unseen. Any member can read it; only Owners and Admins can decide.
export async function listPendingApprovals(actor: Actor, workspaceId: string): Promise<Result<PendingApproval[]>> {
  const access = await requireRole(actor, workspaceId, "MEMBER");
  if (!access.ok) return access;
  const rows = await db.approval.findMany({
    where: { status: "PENDING", proposedAction: { workspaceId } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: APPROVAL_QUEUE_PAGE_SIZE,
    include: {
      proposedAction: {
        select: { createdBy: { select: { name: true } }, contentAsset: { select: { task: { include: taskSummaryInclude } } } },
      },
    },
  });
  return ok(
    rows.map(({ id, createdAt, proposedAction }) => ({
      id,
      submittedBy: proposedAction.createdBy.name,
      submittedAt: createdAt,
      task: toTaskSummary(proposedAction.contentAsset.task),
    })),
  );
}

// Owners and Admins only; approving your own Proposed Action is allowed. A Proposed
// Action whose stored payload fails its hash check is refused, as the execution service
// would refuse it, and so is one past its 7-day deadline, which this marks EXPIRED. The
// status moves from PENDING only if it is still PENDING, so each Approval is decided once.
// The decision and its Activity Log entry commit together, then the Execution starts
// in the background: approving never executes anything itself.
export async function approve(
  actor: Actor,
  workspaceId: string,
  approvalId: string,
  startExecution: StartExecution,
  clock: Clock = systemClock,
): Promise<Result<void>> {
  const access = await requireRole(actor, workspaceId, "ADMIN");
  if (!access.ok) return access;
  const now = clock.now();
  const decided = await db.$transaction(async (tx): Promise<Result<void>> => {
    const approval = await findToDecide(tx, workspaceId, approvalId);
    if (!approval) return fail("NOT_FOUND", APPROVAL_NOT_FOUND);
    if (await isExpired(tx, approval, now)) return fail("CONFLICT", APPROVAL_EXPIRED);
    const { payload, payloadHash } = approval.proposedAction;
    if (!verifyPayload(payload, payloadHash)) return fail("CONFLICT", PAYLOAD_CHANGED);
    if (!(await decideIfPending(tx, actor, approvalId, { status: "APPROVED" }, now))) {
      return fail("CONFLICT", APPROVAL_ALREADY_DECIDED);
    }
    await appendActivity(tx, {
      workspaceId,
      actor,
      brandId: approval.proposedAction.brandId,
      approvalId,
      event: "APPROVAL_APPROVED",
      details: { payloadHash },
    });
    return ok(undefined);
  });
  if (!decided.ok) return decided;
  // If this throws, the Approval stays APPROVED with no Execution; starting it again
  // without a new approval comes with retries (ticket 10).
  await startExecution(approvalId);
  return decided;
}

// Owners and Admins only, with a comment that tells the author what to change; the
// comment is shown on the Approval and logged. Like approve, it moves the status from
// PENDING only if it is still PENDING, refuses (and expires) one past its deadline, and
// the decision commits with its Activity Log entry. Rejecting executes nothing, so the
// payload's hash is not checked.
export async function reject(
  actor: Actor,
  workspaceId: string,
  approvalId: string,
  input: RejectInput,
  clock: Clock = systemClock,
): Promise<Result<void>> {
  const access = await requireRole(actor, workspaceId, "ADMIN");
  if (!access.ok) return access;
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return fail("INVALID_INPUT", "Check the comment.", z.flattenError(parsed.error).fieldErrors);
  const { comment } = parsed.data;
  const now = clock.now();
  return db.$transaction(async (tx): Promise<Result<void>> => {
    const approval = await findToDecide(tx, workspaceId, approvalId);
    if (!approval) return fail("NOT_FOUND", APPROVAL_NOT_FOUND);
    if (await isExpired(tx, approval, now)) return fail("CONFLICT", APPROVAL_EXPIRED);
    if (!(await decideIfPending(tx, actor, approvalId, { status: "REJECTED", comment }, now))) {
      return fail("CONFLICT", APPROVAL_ALREADY_DECIDED);
    }
    await appendActivity(tx, {
      workspaceId,
      actor,
      brandId: approval.proposedAction.brandId,
      approvalId,
      event: "APPROVAL_REJECTED",
      details: { payloadHash: approval.proposedAction.payloadHash, comment },
    });
    return ok(undefined);
  });
}

// The expiry sweep: run by a periodic background function, not by a person, so it checks
// no role. It expires, oldest deadline first, up to EXPIRY_SWEEP_BATCH_SIZE Pending
// Approvals past their deadline (the next run takes the rest), each in its own
// transaction with its log entry. Each update is conditional, so one decided or expired
// meanwhile is left as it is. Returns how many this run expired.
export async function expireOverdueApprovals(clock: Clock = systemClock): Promise<number> {
  const now = clock.now();
  const overdue = await db.approval.findMany({
    where: { status: "PENDING", expiresAt: { lte: now } },
    orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
    take: EXPIRY_SWEEP_BATCH_SIZE,
    select: {
      id: true,
      status: true,
      expiresAt: true,
      proposedAction: { select: { workspaceId: true, brandId: true, payloadHash: true } },
    },
  });
  let expiredCount = 0;
  for (const approval of overdue) {
    if (await db.$transaction((tx) => expireIfOverdue(tx, approval, now))) expiredCount += 1;
  }
  return expiredCount;
}

// Any member can resubmit a Rejected Approval: its Content Asset, as it is now, to the
// same audience, becomes a new Proposed Action with a new Pending Approval that links
// back to the rejected one.
// The rejected records are never written. REJECTED is final, so the status read here
// can't change before the write, and the unique link lets only one resubmission through,
// even when two people resubmit at the same moment.
export async function resubmit(actor: Actor, workspaceId: string, approvalId: string): Promise<Result<Approval>> {
  const access = await requireRole(actor, workspaceId, "MEMBER");
  if (!access.ok) return access;
  const rejected = await db.approval.findFirst({
    where: inWorkspace(approvalId, workspaceId),
    include: {
      proposedAction: {
        select: {
          payload: true,
          payloadHash: true,
          contentAsset: { select: { ...reviewVariantSelect, task: { include: taskSummaryInclude } } },
        },
      },
    },
  });
  if (!rejected) return fail("NOT_FOUND", APPROVAL_NOT_FOUND);
  if (rejected.status !== "REJECTED") return fail("CONFLICT", NOT_REJECTED);
  const { payload, payloadHash, contentAsset: asset } = rejected.proposedAction;
  const previous = verifyPayload(payload, payloadHash);
  if (!previous) return fail("CONFLICT", RESUBMITTED_PAYLOAD_CHANGED);
  const { task, ...contentAsset } = asset;
  const proposal: Proposal = {
    workspaceId,
    task: toTaskSummary(task),
    contentAsset: toReviewVariant(contentAsset),
    audience: previous.audience,
    resubmissionOfId: approvalId,
  };
  try {
    return ok(await db.$transaction((tx) => proposeAction(tx, actor, proposal)));
  } catch (error: unknown) {
    if (isUniqueViolation(error)) return fail("CONFLICT", ALREADY_RESUBMITTED);
    throw error;
  }
}
