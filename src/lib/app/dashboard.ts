import { db } from "@/lib/db";
import { requireRole, type Actor } from "@/lib/permissions";
import { findActivity, type ActivityEntry } from "./activity-log";
import { ok, type Result } from "./result";
import { taskSummaryInclude, toTaskSummary, type TaskSummary } from "./tasks";

// Each list on the dashboard shows at most this many items; the counts are exact.
export const DASHBOARD_LIST_SIZE = 5;
export const DASHBOARD_ACTIVITY_SIZE = 10;

export interface DashboardApproval {
  id: string;
  submittedBy: string;
  submittedAt: Date;
  task: TaskSummary;
}

// What a member sees first: what waits for a person, what went wrong, what happened.
export interface Dashboard {
  openReviewCount: number;
  // Oldest first, so nothing waits unseen.
  openReviews: TaskSummary[];
  pendingApprovalCount: number;
  pendingApprovals: DashboardApproval[];
  // Failed Tasks and final Execution failures, newest first.
  recentFailures: ActivityEntry[];
  recentActivity: ActivityEntry[];
}

// Any member; everything is scoped to the Workspace.
export async function getDashboard(actor: Actor, workspaceId: string): Promise<Result<Dashboard>> {
  const access = await requireRole(actor, workspaceId, "MEMBER");
  if (!access.ok) return access;
  const openReviewWhere = { workspaceId, status: "IN_REVIEW" as const };
  const pendingWhere = { status: "PENDING" as const, proposedAction: { workspaceId } };
  const [openReviewCount, reviewRows, pendingApprovalCount, approvalRows, recentFailures, recentActivity] = await Promise.all([
    db.task.count({ where: openReviewWhere }),
    db.task.findMany({
      where: openReviewWhere,
      orderBy: [{ finishedAt: "asc" }, { id: "asc" }],
      take: DASHBOARD_LIST_SIZE,
      include: taskSummaryInclude,
    }),
    db.approval.count({ where: pendingWhere }),
    db.approval.findMany({
      where: pendingWhere,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: DASHBOARD_LIST_SIZE,
      include: {
        proposedAction: {
          select: { createdBy: { select: { name: true } }, contentAsset: { select: { task: { include: taskSummaryInclude } } } },
        },
      },
    }),
    findActivity(
      {
        workspaceId,
        OR: [{ event: "TASK_FAILED" }, { event: "EXECUTION_FAILED", details: { path: ["final"], equals: true } }],
      },
      DASHBOARD_LIST_SIZE,
    ),
    findActivity({ workspaceId }, DASHBOARD_ACTIVITY_SIZE),
  ]);
  return ok({
    openReviewCount,
    openReviews: reviewRows.map(toTaskSummary),
    pendingApprovalCount,
    pendingApprovals: approvalRows.map(({ id, createdAt, proposedAction }) => ({
      id,
      submittedBy: proposedAction.createdBy.name,
      submittedAt: createdAt,
      task: toTaskSummary(proposedAction.contentAsset.task),
    })),
    recentFailures,
    recentActivity,
  });
}
