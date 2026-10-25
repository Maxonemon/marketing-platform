import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTask, type TaskAiUsage, type TaskDetail } from "@/lib/app/tasks";
import { CHANNEL_LABELS, CONTENT_TYPE_LABELS } from "@/lib/content-options";
import { requireWorkspace } from "../../require-workspace";
import { TASK_STATUS_LABELS, TaskTimes, taskTitle } from "../task-display";

interface TaskDetailPageProps {
  params: Promise<{ slug: string; taskId: string }>;
}

export default function TaskDetailPage({ params }: TaskDetailPageProps) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
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
      <div className="flex flex-col gap-1 text-sm">
        <Link href={`/w/${workspace.slug}/tasks`} className="text-zinc-500 underline">
          All Tasks
        </Link>
        <h1 className="text-2xl font-semibold">{taskTitle(task)}</h1>
        <p>Status: {TASK_STATUS_LABELS[task.status]}</p>
        <TaskTimes task={task} />
      </div>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Input</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="font-medium">Brand</dt>
          <dd>
            <Link href={`/w/${workspace.slug}/brands/${task.brand.id}`} className="underline">
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
        <h2 className="text-lg font-semibold">Result</h2>
        <TaskResult task={task} workspaceSlug={workspace.slug} />
      </section>
      {task.aiUsage && (
        <section className="flex flex-col gap-2 text-sm">
          <h2 className="text-lg font-semibold">AI usage</h2>
          <AiUsage usage={task.aiUsage} />
        </section>
      )}
      {task.error && (
        <section className="flex flex-col gap-2 text-sm">
          <h2 className="text-lg font-semibold">Error</h2>
          <p role="alert" className="wrap-break-word text-red-600">
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
      return <p className="text-zinc-500">The content agent is writing in the background. Refresh to see progress.</p>;
    case "IN_REVIEW":
      return (
        <p>
          {variants} ready.{" "}
          <Link href={`/w/${workspaceSlug}/tasks/${task.id}/review`} className="underline">
            Open the Review
          </Link>
        </p>
      );
    case "FAILED":
    case "CANCELLED":
      return <p className="text-zinc-500">Nothing was written.</p>;
    case "COMPLETED":
      return <p>{variants} written.</p>;
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
