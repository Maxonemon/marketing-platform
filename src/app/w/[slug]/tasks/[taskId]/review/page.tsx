import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getReview } from "@/lib/app/reviews";
import { requireWorkspace } from "../../../require-workspace";
import { RuleViolations } from "../../../rule-violations";
import { PageHeader, PageSkeleton } from "../../../ui";
import { discardReviewAction, editVariantAction, submitReviewAction } from "../../actions";
import { TaskActionForm } from "../../task-action-form";
import { taskTitle } from "../../task-display";
import { EditVariantForm } from "./edit-variant-form";
import { SubmitVariantForm } from "./submit-variant-form";

interface ReviewPageProps {
  params: Promise<{ slug: string; taskId: string }>;
}

export default function ReviewPage({ params }: ReviewPageProps) {
  return (
    <Suspense fallback={<PageSkeleton />}>
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
      <PageHeader
        back={{ href: `/w/${workspace.slug}/tasks/${task.id}`, label: "Task details" }}
        title={`Review: ${taskTitle(task)}`}
        description={
          <>
            <p className="wrap-break-word whitespace-pre-wrap">
              <span className="font-medium text-foreground">Brief:</span> {task.input.brief}
            </p>
            <p className="mt-2">
              Pick the Variant to publish, and edit it first if it needs it. Submitting turns it into a Proposed Action
              that an Owner or Admin must approve. Brand rule warnings don&apos;t block you; the Approver sees them too.
            </p>
          </>
        }
        actions={
          <TaskActionForm
            action={discardReviewAction.bind(null, workspace.id, workspace.slug, task.id)}
            label="Discard all"
            confirmation="Discard this Review? Nothing will be submitted for approval."
          />
        }
      />
      <ol className="grid gap-4 md:grid-cols-3">
        {variants.map(({ id, variant, subject, body, violations }) => (
          <li key={id} className="flex min-w-0 flex-col gap-2 surface p-4 text-sm">
            <h2 className="text-xs font-medium text-muted">Variant {variant}</h2>
            {subject && (
              <p className="wrap-break-word">
                <span className="font-medium">Subject:</span> {subject}
              </p>
            )}
            <p className="flex-1 wrap-break-word whitespace-pre-wrap">{body}</p>
            <RuleViolations violations={violations} />
            <EditVariantForm
              action={editVariantAction.bind(null, workspace.id, task.id, id)}
              subject={subject}
              body={body}
            />
            <SubmitVariantForm action={submitAction} contentAssetId={id} variant={variant} />
          </li>
        ))}
      </ol>
    </>
  );
}
