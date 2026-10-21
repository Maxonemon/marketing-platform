import { z } from "zod";
import type { Approval } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireRole, type Actor } from "@/lib/permissions";
import { hashPayload, type ProposedActionPayload } from "@/lib/workflows/proposed-action-payload";
import { appendActivity } from "./activity-log";
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

// Submits the picked Variant for approval: one transaction writes an immutable Proposed
// Action (what would go out, where, to whom and when, with its hash), its Pending
// Approval and the Activity Log entry, and completes the Task. The Task moves from
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
  const picked = parsed.success ? review.value.variants.find(({ id }) => id === parsed.data.contentAssetId) : undefined;
  if (!picked) return fail("INVALID_INPUT", VARIANT_NOT_IN_REVIEW, { contentAssetId: [VARIANT_NOT_IN_REVIEW] });
  const { task } = review.value;
  const payload: ProposedActionPayload = {
    channel: task.input.channel,
    contentType: task.input.contentType,
    content: { body: picked.body },
    audience: null,
    timing: { kind: "AS_SOON_AS_APPROVED" },
  };
  const payloadHash = hashPayload(payload);
  return db.$transaction(async (tx) => {
    const completed = await tx.task.updateMany({
      where: { id: taskId, workspaceId, status: "IN_REVIEW" },
      data: { status: "COMPLETED" },
    });
    if (completed.count === 0) return fail("NOT_FOUND", REVIEW_NOT_FOUND);
    const approval = await tx.approval.create({
      data: {
        proposedAction: {
          create: {
            workspaceId,
            brandId: task.brand.id,
            contentAssetId: picked.id,
            createdById: actor.userId,
            payload,
            payloadHash,
          },
        },
      },
    });
    await appendActivity(tx, {
      workspaceId,
      actor,
      brandId: task.brand.id,
      taskId,
      approvalId: approval.id,
      event: "PROPOSED_ACTION_SUBMITTED",
      details: { payloadHash },
    });
    return ok(approval);
  });
}
