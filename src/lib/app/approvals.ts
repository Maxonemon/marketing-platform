import type { ApprovalStatus, ExecutionStatus, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireRole, type Actor } from "@/lib/permissions";
import { verifyPayload, type ProposedActionPayload } from "@/lib/workflows/proposed-action-payload";
import { appendActivity } from "./activity-log";
import { fail, ok, type Result } from "./result";
import type { ReviewVariant } from "./reviews";
import { taskSummaryInclude, toTaskSummary, type TaskSummary } from "./tasks";

export interface ApprovalDetail {
  id: string;
  status: ApprovalStatus;
  decidedBy: string | null;
  decidedAt: Date | null;
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

// Starts an Approval's background Execution: the app sends an Inngest event, tests record the call.
export type StartExecution = (approvalId: string) => Promise<void>;

const APPROVAL_NOT_FOUND = "Approval not found.";
export const APPROVAL_ALREADY_DECIDED = "This Approval has already been decided.";
const PAYLOAD_CHANGED = "This Proposed Action no longer matches its hash, so it can't be approved.";

const approvalDetailInclude = {
  decidedBy: { select: { name: true } },
  executions: {
    select: { id: true, attempt: true, status: true, error: true, startedAt: true, finishedAt: true },
    orderBy: { attempt: "asc" },
  },
  proposedAction: {
    include: {
      createdBy: { select: { name: true } },
      contentAsset: { select: { id: true, variant: true, body: true, task: { include: taskSummaryInclude } } },
    },
  },
} satisfies Prisma.ApprovalInclude;

// Approvals belong to the Workspace of their Proposed Action.
function inWorkspace(approvalId: string, workspaceId: string): Prisma.ApprovalWhereInput {
  return { id: approvalId, proposedAction: { workspaceId } };
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
    proposedAction: {
      id: proposedAction.id,
      payload: verifyPayload(proposedAction.payload, proposedAction.payloadHash),
      payloadHash: proposedAction.payloadHash,
      createdBy: proposedAction.createdBy.name,
      createdAt: proposedAction.createdAt,
    },
    contentAsset,
    task: toTaskSummary(task),
    executions: row.executions,
  });
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
    const approval = await tx.approval.findFirst({
      where: inWorkspace(approvalId, workspaceId),
      include: { proposedAction: { select: { brandId: true, payload: true, payloadHash: true } } },
    });
    if (!approval) return fail("NOT_FOUND", APPROVAL_NOT_FOUND);
    const { payload, payloadHash } = approval.proposedAction;
    if (!verifyPayload(payload, payloadHash)) return fail("CONFLICT", PAYLOAD_CHANGED);
    const claimed = await tx.approval.updateMany({
      where: { id: approvalId, status: "PENDING" },
      data: { status: "APPROVED", decidedById: actor.userId, decidedAt: new Date() },
    });
    if (claimed.count === 0) return fail("CONFLICT", APPROVAL_ALREADY_DECIDED);
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
