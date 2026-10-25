import { z } from "zod";
import type { Approval, ApprovalStatus, Prisma } from "@/generated/prisma/client";
import { ruleViolationsSchema, type RuleViolation } from "@/lib/brand-rules";
import { db } from "@/lib/db";
import { requireRole, type Actor } from "@/lib/permissions";
import { hashPayload, verifyPayload, type ProposedActionPayload } from "@/lib/workflows/proposed-action-payload";
import { appendActivity } from "./activity-log";
import { APPROVAL_NOT_FOUND, canBeSuperseded, lockApproval, payloadOf, proposeAction } from "./approvals";
import { audienceSchema, checkContent, parseContent, type ContentInput } from "./content-edits";
import { fail, ok, type Result } from "./result";
import { taskSummaryInclude, toTaskSummary, type TaskSummary } from "./tasks";
import { reviewVariantSelect, toReviewVariant, type ReviewVariant } from "./variants";

// A Content Asset with every Proposed Action made of it, newest first.
export interface ContentAssetDetail extends ReviewVariant {
  task: TaskSummary;
  proposals: ProposalHistoryEntry[];
}

export interface ProposalHistoryEntry {
  proposedActionId: string;
  // null when the stored payload fails its hash check: it will never be executed.
  payload: ProposedActionPayload | null;
  payloadHash: string;
  // The Brand rules its text broke when it was proposed.
  violations: RuleViolation[];
  createdBy: string;
  createdAt: Date;
  approval: {
    id: string;
    status: ApprovalStatus;
    supersededById: string | null;
    // Whether an edit can still supersede it (see canBeSuperseded).
    isEditable: boolean;
  } | null;
}

// The edited text and who it reaches. Audience is blank or left out for none.
export type ProposedContentInput = ContentInput & { audience?: string };

const CONTENT_ASSET_NOT_FOUND = "Content Asset not found.";
const NOTHING_CHANGED = "Nothing changed: edit the text or the audience first.";
export const NOT_EDITABLE =
  "This version can't be changed any more: it was decided, replaced, or has gone or is going out.";

const contentAssetDetailSelect = {
  ...reviewVariantSelect,
  task: { include: taskSummaryInclude },
  proposedActions: {
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      createdBy: { select: { name: true } },
      approval: { select: { id: true, status: true, supersededById: true, executions: { select: { status: true } } } },
    },
  },
} satisfies Prisma.ContentAssetSelect;

// Any member can read a Content Asset and its history. Scoped by workspaceId through its
// Task, so another Workspace's Content Asset looks exactly like a missing one.
export async function getContentAsset(
  actor: Actor,
  workspaceId: string,
  contentAssetId: string,
): Promise<Result<ContentAssetDetail>> {
  const access = await requireRole(actor, workspaceId, "MEMBER");
  if (!access.ok) return access;
  const row = await db.contentAsset.findFirst({
    where: { id: contentAssetId, task: { workspaceId } },
    select: contentAssetDetailSelect,
  });
  if (!row) return fail("NOT_FOUND", CONTENT_ASSET_NOT_FOUND);
  const { task, proposedActions, ...variant } = row;
  return ok({
    ...toReviewVariant(variant),
    task: toTaskSummary(task),
    proposals: proposedActions.map((proposedAction) => ({
      proposedActionId: proposedAction.id,
      payload: verifyPayload(proposedAction.payload, proposedAction.payloadHash),
      payloadHash: proposedAction.payloadHash,
      violations: ruleViolationsSchema.parse(proposedAction.ruleViolations),
      createdBy: proposedAction.createdBy.name,
      createdAt: proposedAction.createdAt,
      approval: proposedAction.approval && {
        id: proposedAction.approval.id,
        status: proposedAction.approval.status,
        supersededById: proposedAction.approval.supersededById,
        isEditable: canBeSuperseded(proposedAction.approval.status, proposedAction.approval.executions),
      },
    })),
  });
}

// Any member can edit content after submission. Every material change (text, audience,
// Channel or timing) needs a fresh decision, so one transaction updates the Content
// Asset (its Brand rules checked again), proposes it as a new Proposed Action with a new
// Pending Approval, and marks the edited version's Approval SUPERSEDED, pointing to the
// new one, with both logged. The old Proposed Action is never written.
// The edited version must still be supersedable (canBeSuperseded) when its row lock is
// held, so of two edits of the same version only one goes through, and an Execution
// either claimed its attempt first (the edit is refused) or finds it SUPERSEDED.
export async function editProposedContent(
  actor: Actor,
  workspaceId: string,
  approvalId: string,
  input: ProposedContentInput,
): Promise<Result<Approval>> {
  const access = await requireRole(actor, workspaceId, "MEMBER");
  if (!access.ok) return access;
  const edited = await db.approval.findFirst({
    where: { id: approvalId, proposedAction: { workspaceId } },
    select: {
      proposedAction: {
        select: { payloadHash: true, contentAsset: { select: { id: true, task: { include: { ...taskSummaryInclude, brand: true } } } } },
      },
    },
  });
  if (!edited) return fail("NOT_FOUND", APPROVAL_NOT_FOUND);
  const { payloadHash: editedHash, contentAsset } = edited.proposedAction;
  const { brand } = contentAsset.task;
  const task = toTaskSummary(contentAsset.task);
  const content = parseContent(task.input.contentType, input);
  if (!content.ok) return content;
  const audience = audienceSchema.safeParse(input.audience ?? "");
  if (!audience.success) {
    return fail("INVALID_INPUT", "Check the highlighted fields.", { audience: z.flattenError(audience.error).formErrors });
  }
  const violations = checkContent(content.value, brand);
  const proposal = { workspaceId, task, contentAsset: { id: contentAsset.id, ...content.value, violations }, audience: audience.data };
  if (hashPayload(payloadOf(proposal)) === editedHash) return fail("INVALID_INPUT", NOTHING_CHANGED);

  return db.$transaction(async (tx): Promise<Result<Approval>> => {
    await lockApproval(tx, approvalId);
    // Read after the lock, so it sees an Execution claimed or an edit committed meanwhile.
    const current = await tx.approval.findUniqueOrThrow({
      where: { id: approvalId },
      select: { status: true, executions: { select: { status: true } } },
    });
    if (!canBeSuperseded(current.status, current.executions)) return fail("CONFLICT", NOT_EDITABLE);
    await tx.contentAsset.update({
      where: { id: contentAsset.id },
      data: { ...content.value, ruleViolations: violations },
    });
    const approval = await proposeAction(tx, actor, proposal);
    await tx.approval.update({ where: { id: approvalId }, data: { status: "SUPERSEDED", supersededById: approval.id } });
    await appendActivity(tx, {
      workspaceId,
      actor,
      brandId: task.brand.id,
      taskId: task.id,
      approvalId,
      event: "APPROVAL_SUPERSEDED",
      details: { payloadHash: editedHash, supersededById: approval.id },
    });
    return ok(approval);
  });
}
