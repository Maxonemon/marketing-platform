import type { TaskStatus } from "@/generated/prisma/client";
import type { TaskSummary } from "@/lib/app/tasks";
import { CONTENT_TYPE_LABELS } from "@/lib/content-options";
import { Timestamp } from "../timestamp";

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  QUEUED: "Queued",
  RUNNING: "Running",
  IN_REVIEW: "In review",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

// What the Task is for, e.g. "Social post for Northwind Coffee".
export function taskTitle(task: TaskSummary): string {
  return `${CONTENT_TYPE_LABELS[task.input.contentType]} for ${task.brand.name}`;
}

interface TaskTimesProps {
  task: TaskSummary;
}

export function TaskTimes({ task }: TaskTimesProps) {
  return (
    <span className="text-zinc-500">
      Requested by {task.requestedBy} <Timestamp date={task.createdAt} />
      {task.startedAt && (
        <>
          {" "}
          · started <Timestamp date={task.startedAt} />
        </>
      )}
      {task.finishedAt && (
        <>
          {" "}
          · finished <Timestamp date={task.finishedAt} />
        </>
      )}
    </span>
  );
}
