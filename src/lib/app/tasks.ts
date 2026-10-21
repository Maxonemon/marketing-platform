import type { Prisma, TaskStatus, TaskType } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireRole, type Actor } from "@/lib/permissions";
import { contentRequestSchema, type ContentRequest } from "./content-requests";
import { fail, ok, type Result } from "./result";

// Task history shows this many of the newest Tasks. Filters come in ticket 14.
export const TASK_HISTORY_PAGE_SIZE = 100;

export interface TaskSummary {
  id: string;
  type: TaskType;
  status: TaskStatus;
  brand: { id: string; name: string };
  requestedBy: string;
  input: ContentRequest;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface TaskDetail extends TaskSummary {
  error: string | null;
  // The result: how many Variants the run saved as Content Assets.
  variantCount: number;
}

const TASK_NOT_FOUND = "Task not found.";

export const taskSummaryInclude = {
  brand: { select: { id: true, name: true } },
  requestedBy: { select: { name: true } },
} satisfies Prisma.TaskInclude;

type TaskSummaryRow = Prisma.TaskGetPayload<{ include: typeof taskSummaryInclude }>;

export function toTaskSummary(row: TaskSummaryRow): TaskSummary {
  const { id, type, status, brand, requestedBy, input, createdAt, startedAt, finishedAt } = row;
  return {
    id,
    type,
    status,
    brand,
    requestedBy: requestedBy.name,
    input: contentRequestSchema.parse(input),
    createdAt,
    startedAt,
    finishedAt,
  };
}

// Newest first. Only members of the Workspace can read its Tasks.
export async function listTasks(actor: Actor, workspaceId: string): Promise<Result<TaskSummary[]>> {
  const access = await requireRole(actor, workspaceId, "MEMBER");
  if (!access.ok) return access;
  const rows = await db.task.findMany({
    where: { workspaceId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: TASK_HISTORY_PAGE_SIZE,
    include: taskSummaryInclude,
  });
  return ok(rows.map(toTaskSummary));
}

// Scoped by workspaceId, so another Workspace's Task looks exactly like a missing one.
export async function getTask(actor: Actor, workspaceId: string, taskId: string): Promise<Result<TaskDetail>> {
  const access = await requireRole(actor, workspaceId, "MEMBER");
  if (!access.ok) return access;
  const row = await db.task.findFirst({
    where: { id: taskId, workspaceId },
    include: { ...taskSummaryInclude, _count: { select: { contentAssets: true } } },
  });
  if (!row) return fail("NOT_FOUND", TASK_NOT_FOUND);
  return ok({ ...toTaskSummary(row), error: row.error, variantCount: row._count.contentAssets });
}
