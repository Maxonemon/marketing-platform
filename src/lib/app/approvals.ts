import { z } from "zod";
import type { Approval, ApprovalStatus, ExecutionStatus, Prisma } from "@/generated/prisma/client";
import { db, isUniqueViolation } from "@/lib/db";
import { APPROVAL_COMMENT_MAX_LENGTH } from "@/lib/limits";
import { requireRole, type Actor } from "@/lib/permissions";
import { hashPayload, verifyPayload, type ProposedActionPayload } from "@/lib/workflows/proposed-action-payload";
import { appendActivity } from "./activity-log";
import { fail, ok, type Result } from "./result";
import { taskSummaryInclude, toTaskSummary, type TaskSummary } from "./tasks";
import { reviewVariantSelect, toReviewVariant, type ReviewVariant } from "./variants";

export interface ApprovalDetail {
  id: string;
  status: ApprovalStatus;
  decidedBy: string | null;
  decidedAt: Date | null;
  // The Approver's reason; always set on a REJECTED Approval.
  comment: string | null;
  // The Rejected Approval this one resubmits, and the Approval this one was resubmitted as.
  resubmissionOfId: string | null;
  resubmittedAsId: string | null;
  // Exactly what would be executed, and its hash.
  proposedAction: {
    id: string;
    // null when the stored payload fails its hash check: it will never be executed.
    payload: ProposedActionPayload | null;
    payloadHash: string;
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
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

// What to propose: a Content Asset as it is now, who it reaches, and the Task it came
// from (its Brand, Channel and content type).
export interface Proposal {
  workspaceId: string;
  task: TaskSummary;
  contentAsset: { id: string; subject: string | null; body: string };
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

// The approval queue shows this many of the oldest Pending Approvals.
export const APPROVAL_QUEUE_PAGE_SIZE = 100;

// Starts an Approval's background Execution: the app sends an Inngest event, tests record the call.
export type StartExecution = (approvalId: string) => Promise<void>;

const APPROVAL_NOT_FOUND = "Approval not found.";
export const APPROVAL_ALREADY_DECIDED = "This Approval has already been decided.";
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
  executions: {
    select: { id: true, attempt: true, status: true, error: true, startedAt: true, finishedAt: true },
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
    data: { workspaceId, brandId: task.brand.id, contentAssetId: contentAsset.id, createdById: actor.userId, payload, payloadHash },
  });
  // The link is written as a plain foreign key, so a second resubmission breaks its
  // unique index. A nested connect would instead unlink the earlier resubmission.
  const approval = await tx.approval.create({ data: { proposedActionId: proposedAction.id, resubmissionOfId } });
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
// Approval. Claiming an Execution and superseding both take this lock first, then read
// the Approval, so each sees the other's committed change.
export async function lockApproval(tx: Prisma.TransactionClient, approvalId: string): Promise<boolean> {
  const locked = await tx.$queryRaw<unknown[]>`SELECT 1 FROM "Approval" WHERE "id" = ${approvalId} FOR UPDATE`;
  return locked.length === 1;
}

// What deciding needs to know about the Approval's Proposed Action.
function findToDecide(tx: Prisma.TransactionClient, workspaceId: string, approvalId: string) {
  return tx.approval.findFirst({
    where: inWorkspace(approvalId, workspaceId),
    include: { proposedAction: { select: { brandId: true, payload: true, payloadHash: true } } },
  });
}

type Decision = { status: "APPROVED" } | { status: "REJECTED"; comment: string };

// Moves the Approval from PENDING to the decision only if it is still PENDING. Of two
// decisions at the same moment, the second waits for the first's row lock, then finds
// the Approval no longer PENDING and changes nothing: false.
async function decideIfPending(
  tx: Prisma.TransactionClient,
  actor: Actor,
  approvalId: string,
  decision: Decision,
): Promise<boolean> {
  const claimed = await tx.approval.updateMany({
    where: { id: approvalId, status: "PENDING" },
    data: { ...decision, decidedById: actor.userId, decidedAt: new Date() },
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
    comment: row.comment,
    resubmissionOfId: row.resubmissionOfId,
    resubmittedAsId: row.resubmittedAs?.id ?? null,
    proposedAction: {
      id: proposedAction.id,
      payload: verifyPayload(proposedAction.payload, proposedAction.payloadHash),
      payloadHash: proposedAction.payloadHash,
      createdBy: proposedAction.createdBy.name,
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
// would refuse it. The status moves from PENDING only if it is still PENDING, so each
// Approval is decided once.
// The decision and its Activity Log entry commit together, then the Execution starts
// in the background: approving never executes anything itself.
export async function approve(
  actor: Actor,
  workspaceId: string,
  approvalId: string,
  startExecution: StartExecution,
): Promise<Result<void>> {
  const access = await requireRole(actor, workspaceId, "ADMIN");
  if (!access.ok) return access;
  const decided = await db.$transaction(async (tx): Promise<Result<void>> => {
    const approval = await findToDecide(tx, workspaceId, approvalId);
    if (!approval) return fail("NOT_FOUND", APPROVAL_NOT_FOUND);
    const { payload, payloadHash } = approval.proposedAction;
    if (!verifyPayload(payload, payloadHash)) return fail("CONFLICT", PAYLOAD_CHANGED);
    if (!(await decideIfPending(tx, actor, approvalId, { status: "APPROVED" }))) {
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
// PENDING only if it is still PENDING, and the decision commits with its Activity Log
// entry. Rejecting executes nothing, so the payload's hash is not checked.
export async function reject(
  actor: Actor,
  workspaceId: string,
  approvalId: string,
  input: RejectInput,
): Promise<Result<void>> {
  const access = await requireRole(actor, workspaceId, "ADMIN");
  if (!access.ok) return access;
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return fail("INVALID_INPUT", "Check the comment.", z.flattenError(parsed.error).fieldErrors);
  const { comment } = parsed.data;
  return db.$transaction(async (tx): Promise<Result<void>> => {
    const approval = await findToDecide(tx, workspaceId, approvalId);
    if (!approval) return fail("NOT_FOUND", APPROVAL_NOT_FOUND);
    if (!(await decideIfPending(tx, actor, approvalId, { status: "REJECTED", comment }))) {
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

// Any member can resubmit a Rejected Approval: its Content Asset, as it is now, to the same
// audience, becomes a new Proposed Action with a new Pending Approval that links back to the rejected one.
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
          contentAsset: { select: { id: true, subject: true, body: true, task: { include: taskSummaryInclude } } },
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
    contentAsset,
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
