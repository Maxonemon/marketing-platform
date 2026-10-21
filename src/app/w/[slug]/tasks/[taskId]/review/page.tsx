import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getReview } from "@/lib/app/reviews";
import { requireWorkspace } from "../../../require-workspace";
import { taskTitle } from "../../task-display";

interface ReviewPageProps {
  params: Promise<{ slug: string; taskId: string }>;
}

export default function ReviewPage({ params }: ReviewPageProps) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <ReviewView params={params} />
    </Suspense>
  );
}

// Only an IN_REVIEW Task has a Review; any other Task's Review is not found.
async function ReviewView({ params }: ReviewPageProps) {
  const { slug, taskId } = await params;
  const { actor, workspace } = await requireWorkspace(slug);
  const result = await getReview(actor, workspace.id, taskId);
  if (!result.ok) notFound();
  const { task, variants } = result.value;

  return (
    <>
      <div className="flex flex-col gap-1 text-sm">
        <Link href={`/w/${workspace.slug}/tasks/${task.id}`} className="text-zinc-500 underline">
          Task details
        </Link>
        <h1 className="text-2xl font-semibold">Review: {taskTitle(task)}</h1>
        <p className="wrap-break-word whitespace-pre-wrap text-zinc-500">Brief: {task.input.brief}</p>
      </div>
      <ol className="flex flex-col gap-4">
        {variants.map(({ id, variant, body }) => (
          <li key={id} className="flex flex-col gap-2 rounded border border-zinc-500/30 p-3">
            <h2 className="text-sm font-semibold">Variant {variant}</h2>
            <p className="wrap-break-word whitespace-pre-wrap">{body}</p>
          </li>
        ))}
      </ol>
    </>
  );
}
