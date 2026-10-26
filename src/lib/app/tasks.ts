import { z } from "zod";
import { TaskStatus, type Prisma, type TaskType } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireRole, type Actor } from "@/lib/permissions";
import { appendActivity } from "./activity-log";
import { contentRequestSchema, type ContentRequest } from "./content-requests";
import { fail, ok, type Result } from "./result";

// Task history shows this many of the newest Tasks that match its filters.
export const TASK_HISTORY_PAGE_SIZE = 100;

export const TASK_STATUSES = Object.values(TaskStatus) as [TaskStatus, ...TaskStatus[]];

// From the page's query string: each filter is optional and only narrows the list.
const taskFiltersSchema = z.object({
  brandId: z.string().min(1).optional(),
  status: z.enum(TASK_STATUSES, "Choose a status.").optional(),
});

export type TaskFiltersInput = z.input<typeof taskFiltersSchema>;

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
  // What the AI call used and its estimated cost; null until the model has answered.
  aiUsage: TaskAiUsage | null;
}

export interface TaskAiUsage {
  // A key of src/lib/ai/pricing.ts when the Task ran.
  model: string;
  inputTokens: number;
  outputTokens: number;
  // In millionths of a US dollar, at the model's prices when the Task ran.
  costMicroUsd: number;
}

const TASK_NOT_FOUND = "Task not found.";
export const ONLY_QUEUED_CANCELLABLE = "Only a queued Task can be cancelled: this one has already started.";

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

// Newest first. Only members of the Workspace can read its Tasks; filters only narrow
// within it, so a Brand id from another Workspace simply matches nothing.
export async function listTasks(actor: Actor, workspaceId: string, filters: TaskFiltersInput = {}): Promise<Result<TaskSummary[]>> {
  const access = await requireRole(actor, workspaceId, "MEMBER");
  if (!access.ok) return access;
  const parsed = taskFiltersSchema.safeParse(filters);
  if (!parsed.success) return fail("INVALID_INPUT", "Check the filters.", z.flattenError(parsed.error).fieldErrors);
  const rows = await db.task.findMany({
    where: { workspaceId, ...parsed.data },
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
  return ok({ ...toTaskSummary(row), error: row.error, variantCount: row._count.contentAssets, aiUsage: toAiUsage(row) });
}

type AiUsageFields = Pick<Prisma.TaskGetPayload<object>, "aiModel" | "inputTokens" | "outputTokens" | "costMicroUsd">;

// The fields are written together (src/lib/app/content-requests.ts): all set or all null.
function toAiUsage({ aiModel, inputTokens, outputTokens, costMicroUsd }: AiUsageFields): TaskAiUsage | null {
  if (aiModel === null || inputTokens === null || outputTokens === null || costMicroUsd === null) return null;
  return { model: aiModel, inputTokens, outputTokens, costMicroUsd };
}

// Any member can cancel a QUEUED Task. The background run claims only a QUEUED Task, so a
// cancelled one never calls the AI; the status moves only if it is still QUEUED, so a run
// that claimed it first wins and the cancel is refused.
export async function cancelTask(actor: Actor, workspaceId: string, taskId: string): Promise<Result<void>> {
  const access = await requireRole(actor, workspaceId, "MEMBER");
  if (!access.ok) return access;
  return db.$transaction(async (tx): Promise<Result<void>> => {
    const task = await tx.task.findFirst({ where: { id: taskId, workspaceId }, select: { brandId: true } });
    if (!task) return fail("NOT_FOUND", TASK_NOT_FOUND);
    const cancelled = await tx.task.updateMany({
      where: { id: taskId, workspaceId, status: "QUEUED" },
      data: { status: "CANCELLED", finishedAt: new Date() },
    });
    if (cancelled.count === 0) return fail("CONFLICT", ONLY_QUEUED_CANCELLABLE);
    await appendActivity(tx, { workspaceId, actor, brandId: task.brandId, taskId, event: "TASK_CANCELLED", details: {} });
    return ok(undefined);
  });
}
