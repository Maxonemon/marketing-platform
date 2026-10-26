import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTask, type TaskAiUsage, type TaskDetail } from "@/lib/app/tasks";
import { CHANNEL_LABELS, CONTENT_TYPE_LABELS } from "@/lib/content-options";
import { requireWorkspace } from "../../require-workspace";
import { PageHeader, PageSkeleton } from "../../ui";
import { cancelTaskAction } from "../actions";
import { TaskActionForm } from "../task-action-form";
import { TaskStatusBadge, TaskTimes, taskTitle } from "../task-display";

interface TaskDetailPageProps {
  params: Promise<{ slug: string; taskId: string }>;
}

export default function TaskDetailPage({ params }: TaskDetailPageProps) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TaskDetailView params={params} />
    </Suspense>
  );
}

async function TaskDetailView({ params }: TaskDetailPageProps) {
  const { slug, taskId } = await params;
  const { actor, workspace } = await requireWorkspace(slug);
  const result = await getTask(actor, workspace.id, taskId);
  if (!result.ok) notFound();
  const task = result.value;

  return (
    <>
      <PageHeader
        back={{ href: `/w/${workspace.slug}/tasks`, label: "All Tasks" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {taskTitle(task)} <TaskStatusBadge status={task.status} />
          </span>
        }
        description={<TaskTimes task={task} />}
        actions={
          task.status === "IN_REVIEW" ? (
            <Link href={`/w/${workspace.slug}/tasks/${task.id}/review`} className="btn btn-primary">
              Open the Review
            </Link>
          ) : task.status === "QUEUED" ? (
            <TaskActionForm
              action={cancelTaskAction.bind(null, workspace.id, task.id)}
              label="Cancel Task"
              confirmation="Cancel this Task? The agent won't write anything for it."
            />
          ) : null
        }
      />
      <section className="surface flex flex-col gap-3 p-5">
        <h2 className="text-base font-semibold">Input</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="font-medium">Brand</dt>
          <dd>
            <Link href={`/w/${workspace.slug}/brands/${task.brand.id}`} className="link">
              {task.brand.name}
            </Link>
          </dd>
          <dt className="font-medium">Content type</dt>
          <dd>{CONTENT_TYPE_LABELS[task.input.contentType]}</dd>
          <dt className="font-medium">Channel</dt>
          <dd>{CHANNEL_LABELS[task.input.channel]}</dd>
          <dt className="font-medium">Brief</dt>
          <dd className="wrap-break-word whitespace-pre-wrap">{task.input.brief}</dd>
        </dl>
      </section>
      <section className="flex flex-col gap-2 text-sm">
        <h2 className="text-base font-semibold">Result</h2>
        <TaskResult task={task} workspaceSlug={workspace.slug} />
      </section>
      {task.aiUsage && (
        <section className="flex flex-col gap-2 text-sm">
          <h2 className="text-base font-semibold">AI usage</h2>
          <AiUsage usage={task.aiUsage} />
        </section>
      )}
      {task.error && (
        <section className="flex flex-col gap-2 rounded-[10px] border border-danger/30 bg-danger-soft p-5 text-sm">
          <h2 className="text-base font-semibold text-danger">Error</h2>
          <p role="alert" className="wrap-break-word text-danger">
            {task.error}
          </p>
        </section>
      )}
    </>
  );
}

interface TaskResultProps {
  task: TaskDetail;
  workspaceSlug: string;
}

function TaskResult({ task, workspaceSlug }: TaskResultProps) {
  const variants = `${task.variantCount} Variant${task.variantCount === 1 ? "" : "s"}`;
  switch (task.status) {
    case "QUEUED":
    case "RUNNING":
      return <p className="text-muted">The content agent is writing in the background. Refresh to see progress.</p>;
    case "IN_REVIEW":
      return (
        <p>
          {variants} ready.{" "}
          <Link href={`/w/${workspaceSlug}/tasks/${task.id}/review`} className="link">
            Open the Review
          </Link>
        </p>
      );
    case "FAILED":
    case "CANCELLED":
      return <p className="text-muted">Nothing was written.</p>;
    case "COMPLETED":
      return <p>{variants} written. The Review is closed: submitted for approval, or discarded.</p>;
  }
}

const tokens = new Intl.NumberFormat("en-US");
// Small amounts need more than cents: a short Task can cost a hundredth of a cent.
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumSignificantDigits: 3 });
const MICRO_USD_PER_USD = 1_000_000;

function AiUsage({ usage }: { usage: TaskAiUsage }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      <dt className="font-medium">Model</dt>
      <dd>{usage.model}</dd>
      <dt className="font-medium">Tokens</dt>
      <dd>
        {tokens.format(usage.inputTokens)} in, {tokens.format(usage.outputTokens)} out
      </dd>
      <dt className="font-medium">Estimated cost</dt>
      <dd>{usd.format(usage.costMicroUsd / MICRO_USD_PER_USD)}</dd>
    </dl>
  );
}
