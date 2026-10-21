import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { listTasks, TASK_HISTORY_PAGE_SIZE } from "@/lib/app/tasks";
import { requireWorkspace } from "../require-workspace";
import { TASK_STATUS_LABELS, TaskTimes, taskTitle } from "./task-display";

interface TaskHistoryPageProps {
  params: Promise<{ slug: string }>;
}

export default function TaskHistoryPage({ params }: TaskHistoryPageProps) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <TaskHistory params={params} />
    </Suspense>
  );
}

async function TaskHistory({ params }: TaskHistoryPageProps) {
  const { slug } = await params;
  const { actor, workspace } = await requireWorkspace(slug);
  const result = await listTasks(actor, workspace.id);
  if (!result.ok) notFound();
  const tasks = result.value;

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Tasks</h1>
        <p className="text-sm text-zinc-500">What the agents have done in this Workspace, newest first. Request content from a Brand&apos;s page.</p>
      </div>
      {tasks.length === 0 ? (
        <p className="text-zinc-500">No Tasks yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-500/30 rounded border border-zinc-500/30">
          {tasks.map((task) => (
            <li key={task.id}>
              <Link href={`/w/${workspace.slug}/tasks/${task.id}`} className="flex flex-col gap-1 px-3 py-2 text-sm hover:bg-zinc-500/10">
                <span className="flex justify-between gap-4">
                  <span className="font-medium">{taskTitle(task)}</span>
                  <span>{TASK_STATUS_LABELS[task.status]}</span>
                </span>
                <TaskTimes task={task} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {tasks.length === TASK_HISTORY_PAGE_SIZE && (
        <p className="text-sm text-zinc-500">Showing the latest {TASK_HISTORY_PAGE_SIZE} Tasks.</p>
      )}
    </>
  );
}
