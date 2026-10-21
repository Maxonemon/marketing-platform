import { db } from "@/lib/db";
import { requireRole, type Actor } from "@/lib/permissions";
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
