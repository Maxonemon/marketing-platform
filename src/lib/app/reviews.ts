import { z } from "zod";
import type { Approval } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireRole, type Actor } from "@/lib/permissions";
import { proposeAction } from "./approvals";
import { fail, ok, type Result } from "./result";
import { taskSummaryInclude, toTaskSummary, type TaskSummary } from "./tasks";

export interface ReviewVariant {
  id: string;
  variant: number;
  body: string;
}

export interface Review {
  task: TaskSummary;
  variants: ReviewVariant[];
}

const REVIEW_NOT_FOUND = "Review not found.";
const VARIANT_NOT_IN_REVIEW = "Choose one of this Review's Variants.";

const submitReviewSchema = z.object({ contentAssetId: z.string().min(1, VARIANT_NOT_IN_REVIEW) });

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
      contentAssets: { select: { id: true, variant: true, body: true }, orderBy: { variant: "asc" } },
    },
  });
  if (!row) return fail("NOT_FOUND", REVIEW_NOT_FOUND);
  return ok({ task: toTaskSummary(row), variants: row.contentAssets });
}

// Submits the picked Variant for approval: one transaction completes the Task and
// proposes the Variant (an immutable Proposed Action, its Pending Approval and the
// Activity Log entry). The Task moves from IN_REVIEW only if it is still there, so a
// Review is submitted at most once.
export async function submitReview(
  actor: Actor,
  workspaceId: string,
  taskId: string,
  input: SubmitReviewInput,
): Promise<Result<Approval>> {
  const review = await getReview(actor, workspaceId, taskId);
  if (!review.ok) return review;
  const parsed = submitReviewSchema.safeParse(input);
  const picked = parsed.success ? review.value.variants.find(({ id }) => id === parsed.data.contentAssetId) : undefined;
  if (!picked) return fail("INVALID_INPUT", VARIANT_NOT_IN_REVIEW, { contentAssetId: [VARIANT_NOT_IN_REVIEW] });
  const { task } = review.value;
  return db.$transaction(async (tx) => {
    const completed = await tx.task.updateMany({
      where: { id: taskId, workspaceId, status: "IN_REVIEW" },
      data: { status: "COMPLETED" },
    });
    if (completed.count === 0) return fail("NOT_FOUND", REVIEW_NOT_FOUND);
    return ok(await proposeAction(tx, actor, { workspaceId, task, contentAsset: picked }));
  });
}
