import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getReview } from "@/lib/app/reviews";
import { requireWorkspace } from "../../../require-workspace";
import { RuleViolations } from "../../../rule-violations";
import { submitReviewAction } from "../../actions";
import { taskTitle } from "../../task-display";
import { SubmitVariantForm } from "./submit-variant-form";

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
  const submitAction = submitReviewAction.bind(null, workspace.id, workspace.slug, task.id);

  return (
    <>
      <div className="flex flex-col gap-1 text-sm">
        <Link href={`/w/${workspace.slug}/tasks/${task.id}`} className="text-zinc-500 underline">
          Task details
        </Link>
        <h1 className="text-2xl font-semibold">Review: {taskTitle(task)}</h1>
        <p className="wrap-break-word whitespace-pre-wrap text-zinc-500">Brief: {task.input.brief}</p>
        <p className="text-zinc-500">
          Pick the Variant to publish. Submitting turns it into a Proposed Action that an Owner or Admin must approve.
          Brand rule warnings don&apos;t stop you submitting; the Approver sees them too.
        </p>
      </div>
      <ol className="grid gap-4 md:grid-cols-3">
        {variants.map(({ id, variant, subject, body, violations }) => (
          <li key={id} className="flex min-w-0 flex-col gap-2 rounded border border-zinc-500/30 p-3 text-sm">
            <h2 className="font-semibold">Variant {variant}</h2>
            {subject && (
              <p className="wrap-break-word">
                <span className="font-medium">Subject:</span> {subject}
              </p>
            )}
            <p className="flex-1 wrap-break-word whitespace-pre-wrap">{body}</p>
            <RuleViolations violations={violations} />
            <SubmitVariantForm action={submitAction} contentAssetId={id} variant={variant} />
          </li>
        ))}
      </ol>
    </>
  );
}
