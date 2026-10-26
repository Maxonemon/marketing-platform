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
    <span className="text-muted">
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

// Tones by what the status asks of a person: review waits on someone, failed went wrong.
const STATUS_TONES: Record<TaskStatus, string> = {
  QUEUED: "bg-subtle text-muted",
  RUNNING: "bg-subtle text-foreground",
  IN_REVIEW: "bg-accent-soft text-accent",
  COMPLETED: "bg-success-soft text-success",
  FAILED: "bg-danger-soft text-danger",
  CANCELLED: "bg-subtle text-muted",
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_TONES[status]}`}>
      {TASK_STATUS_LABELS[status]}
    </span>
  );
}
