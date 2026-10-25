import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getContentAsset, type ContentAssetDetail, type ProposalHistoryEntry } from "@/lib/app/content-assets";
import { APPROVAL_STATUS_LABELS } from "../../approvals/approval-display";
import { requireWorkspace } from "../../require-workspace";
import { RuleViolations } from "../../rule-violations";
import { taskTitle } from "../../tasks/task-display";
import { Timestamp } from "../../timestamp";
import { editProposedContentAction } from "../actions";
import { EditProposedContentForm } from "./edit-proposed-content-form";

interface ContentAssetPageProps {
  params: Promise<{ slug: string; contentAssetId: string }>;
}

export default function ContentAssetPage({ params }: ContentAssetPageProps) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <ContentAssetView params={params} />
    </Suspense>
  );
}

async function ContentAssetView({ params }: ContentAssetPageProps) {
  const { slug, contentAssetId } = await params;
  const { actor, workspace } = await requireWorkspace(slug);
  const result = await getContentAsset(actor, workspace.id, contentAssetId);
  if (!result.ok) notFound();
  const contentAsset = result.value;
  const { task } = contentAsset;

  return (
    <>
      <div className="flex flex-col gap-1 text-sm">
        <Link href={`/w/${workspace.slug}/tasks/${task.id}`} className="text-zinc-500 underline">
          Task details
        </Link>
        <h1 className="text-2xl font-semibold">
          Variant {contentAsset.variant}: {taskTitle(task)}
        </h1>
        <p className="text-zinc-500">The editable draft. What goes out is always an approved Proposed Action of it.</p>
      </div>
      <section className="flex flex-col gap-2 text-sm">
        <h2 className="text-lg font-semibold">Content as it is now</h2>
        {contentAsset.subject && (
          <p className="wrap-break-word">
            <span className="font-medium">Subject:</span> {contentAsset.subject}
          </p>
        )}
        <p className="wrap-break-word whitespace-pre-wrap">{contentAsset.body}</p>
        <RuleViolations violations={contentAsset.violations} />
      </section>
      <Edit contentAsset={contentAsset} workspaceId={workspace.id} workspaceSlug={workspace.slug} />
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Proposed Actions</h2>
        <p className="text-sm text-zinc-500">Every version proposed for approval, newest first. None of them ever changes.</p>
        {contentAsset.proposals.length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing has been submitted yet.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-zinc-500/30">
            {contentAsset.proposals.map((entry) => (
              <ProposalItem key={entry.proposedActionId} entry={entry} workspaceSlug={workspace.slug} />
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

interface EditProps {
  contentAsset: ContentAssetDetail;
  workspaceId: string;
  workspaceSlug: string;
}

// Shown while the newest version can still be superseded; the server checks again.
// Before submission, Variants are edited in the Review instead.
function Edit({ contentAsset, workspaceId, workspaceSlug }: EditProps) {
  const [latest] = contentAsset.proposals;
  if (!latest?.approval) return null;
  if (!latest.approval.isEditable) {
    return (
      <p className="text-sm text-zinc-500">
        The newest version is {APPROVAL_STATUS_LABELS[latest.approval.status].toLowerCase()}
        {latest.approval.status === "APPROVED" && " and has gone out or is going out"}, so it can&apos;t be edited.
      </p>
    );
  }
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Edit</h2>
      <p className="text-sm text-zinc-500">
        Any change to the text or the audience makes a new Proposed Action with a new Pending Approval. The current one is
        marked Superseded, even if it was already approved, so it can never go out.
      </p>
      <EditProposedContentForm
        action={editProposedContentAction.bind(null, workspaceId, workspaceSlug, latest.approval.id)}
        subject={contentAsset.subject}
        body={contentAsset.body}
        audience={latest.payload?.audience ?? null}
      />
    </section>
  );
}

interface ProposalItemProps {
  entry: ProposalHistoryEntry;
  workspaceSlug: string;
}

function ProposalItem({ entry, workspaceSlug }: ProposalItemProps) {
  return (
    <li className="flex flex-col gap-1 py-3 text-sm">
      <p>
        {entry.approval ? (
          <Link href={`/w/${workspaceSlug}/approvals/${entry.approval.id}`} className="font-medium underline">
            {APPROVAL_STATUS_LABELS[entry.approval.status]}
          </Link>
        ) : (
          <span className="font-medium">No Approval</span>
        )}{" "}
        <span className="text-zinc-500">
          · submitted by {entry.createdBy} <Timestamp date={entry.createdAt} />
        </span>
      </p>
      {entry.payload ? (
        <>
          <p className="wrap-break-word">
            <span className="font-medium">Audience:</span> {entry.payload.audience ?? <em className="text-zinc-500">None</em>}
          </p>
          {entry.payload.content.subject && (
            <p className="wrap-break-word">
              <span className="font-medium">Subject:</span> {entry.payload.content.subject}
            </p>
          )}
          <p className="wrap-break-word whitespace-pre-wrap text-zinc-500">{entry.payload.content.body}</p>
        </>
      ) : (
        <p role="alert" className="text-red-600">
          The stored Proposed Action no longer matches its hash, so it will never be executed.
        </p>
      )}
    </li>
  );
}
