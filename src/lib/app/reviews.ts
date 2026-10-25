import { z } from "zod";
import type { Approval, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireRole, type Actor } from "@/lib/permissions";
import { proposeAction } from "./approvals";
import { audienceSchema, checkContent, parseContent, type ContentInput } from "./content-edits";
import { contentRequestSchema } from "./content-requests";
import { fail, ok, type Result } from "./result";
import { taskSummaryInclude, toTaskSummary, type TaskSummary } from "./tasks";
import { reviewVariantSelect, toReviewVariant, type ReviewVariant } from "./variants";

export type { ReviewVariant };

export interface Review {
  task: TaskSummary;
  variants: ReviewVariant[];
}

const REVIEW_NOT_FOUND = "Review not found.";
const VARIANT_NOT_IN_REVIEW = "Choose one of this Review's Variants.";

const submitReviewSchema = z.object({
  contentAssetId: z.string().min(1, VARIANT_NOT_IN_REVIEW),
  audience: audienceSchema.optional(),
});

export type SubmitReviewInput = z.input<typeof submitReviewSchema>;

// A Review exists while its content Task is IN_REVIEW: the Variants wait for a person
// to pick one. Scoped by workspaceId, so another Workspace's Review looks missing.
export async function getReview(actor: Actor, workspaceId: string, taskId: string): Promise<Result<Review>> {
  const access = await requireRole(actor, workspaceId, "MEMBER");
  if (!access.ok) return access;
  const row = await db.task.findFirst({
    where: { id: taskId, workspaceId, status: "IN_REVIEW" },
    include: {
      ...taskSummaryInclude,
      contentAssets: { select: reviewVariantSelect, orderBy: { variant: "asc" } },
    },
  });
  if (!row) return fail("NOT_FOUND", REVIEW_NOT_FOUND);
  return ok({ task: toTaskSummary(row), variants: row.contentAssets.map(toReviewVariant) });
}

// Locks an open Review's Task row until the transaction ends; false when the Task is not
// in the Workspace or no longer IN_REVIEW. Editing and submitting both take this lock, so
// an edit lands either before the submit, and is what gets proposed, or not at all.
async function lockOpenReview(tx: Prisma.TransactionClient, workspaceId: string, taskId: string): Promise<boolean> {
  const locked = await tx.$queryRaw<unknown[]>`
    SELECT 1 FROM "Task"
    WHERE "id" = ${taskId} AND "workspaceId" = ${workspaceId} AND "status" = 'IN_REVIEW'
    FOR UPDATE`;
  return locked.length === 1;
}

// Any member can edit a Variant while its Review is open: the Content Asset changes and
// is checked against the Brand's rules again. Nothing has been proposed yet, so nothing
// else changes.
export async function editVariant(
  actor: Actor,
  workspaceId: string,
  taskId: string,
  contentAssetId: string,
  input: ContentInput,
): Promise<Result<void>> {
  const access = await requireRole(actor, workspaceId, "MEMBER");
  if (!access.ok) return access;
  return db.$transaction(async (tx): Promise<Result<void>> => {
    if (!(await lockOpenReview(tx, workspaceId, taskId))) return fail("NOT_FOUND", REVIEW_NOT_FOUND);
    const task = await tx.task.findUniqueOrThrow({ where: { id: taskId }, include: { brand: true } });
    const content = parseContent(contentRequestSchema.parse(task.input).contentType, input);
    if (!content.ok) return content;
    const edited = await tx.contentAsset.updateMany({
      where: { id: contentAssetId, taskId },
      data: { ...content.value, ruleViolations: checkContent(content.value, task.brand) },
    });
    if (edited.count === 0) return fail("NOT_FOUND", VARIANT_NOT_IN_REVIEW);
    return ok(undefined);
  });
}

// Submits the picked Variant for approval, to the audience given: one transaction
// completes the Task and proposes the Variant as it is at that moment (an immutable
// Proposed Action, its Pending Approval and the Activity Log entry). The Task moves from
// IN_REVIEW only if it is still there, so a Review is submitted at most once.
export async function submitReview(
  actor: Actor,
  workspaceId: string,
  taskId: string,
  input: SubmitReviewInput,
): Promise<Result<Approval>> {
  const review = await getReview(actor, workspaceId, taskId);
  if (!review.ok) return review;
  const parsed = submitReviewSchema.safeParse(input);
  if (!parsed.success) {
    return fail("INVALID_INPUT", "Check the highlighted fields.", z.flattenError(parsed.error).fieldErrors);
  }
  const { contentAssetId, audience = null } = parsed.data;
  if (!review.value.variants.some(({ id }) => id === contentAssetId)) {
    return fail("INVALID_INPUT", VARIANT_NOT_IN_REVIEW, { contentAssetId: [VARIANT_NOT_IN_REVIEW] });
  }
  const { task } = review.value;
  return db.$transaction(async (tx) => {
    if (!(await lockOpenReview(tx, workspaceId, taskId))) return fail("NOT_FOUND", REVIEW_NOT_FOUND);
    await tx.task.update({ where: { id: taskId }, data: { status: "COMPLETED" } });
    // Read under the lock: an edit that committed after the Review was read is included.
    const contentAsset = toReviewVariant(
      await tx.contentAsset.findUniqueOrThrow({ where: { id: contentAssetId }, select: reviewVariantSelect }),
    );
    return ok(await proposeAction(tx, actor, { workspaceId, task, contentAsset, audience }));
  });
}
