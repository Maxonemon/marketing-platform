import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { APPROVAL_QUEUE_PAGE_SIZE, listPendingApprovals } from "@/lib/app/approvals";
import { requireWorkspace } from "../require-workspace";
import { taskTitle } from "../tasks/task-display";
import { Timestamp } from "../timestamp";

interface ApprovalQueuePageProps {
  params: Promise<{ slug: string }>;
}

export default function ApprovalQueuePage({ params }: ApprovalQueuePageProps) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <ApprovalQueue params={params} />
    </Suspense>
  );
}

async function ApprovalQueue({ params }: ApprovalQueuePageProps) {
  const { slug } = await params;
  const { actor, workspace } = await requireWorkspace(slug);
  const result = await listPendingApprovals(actor, workspace.id);
  if (!result.ok) notFound();
  const approvals = result.value;

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1>Approvals</h1>
        <p className="text-sm text-muted">
          Pending Approvals in this Workspace, oldest first. Owners and Admins approve or reject them.
        </p>
      </div>
      {approvals.length === 0 ? (
        <p className="text-muted">Nothing is waiting for a decision.</p>
      ) : (
        <ul className="surface flex flex-col divide-y divide-line overflow-hidden">
          {approvals.map((approval) => (
            <li key={approval.id}>
              <Link href={`/w/${workspace.slug}/approvals/${approval.id}`} className="flex flex-col gap-1 px-3 py-2 text-sm hover:bg-subtle">
                <span className="font-medium">{taskTitle(approval.task)}</span>
                <span className="text-muted">
                  Submitted by {approval.submittedBy} <Timestamp date={approval.submittedAt} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {approvals.length === APPROVAL_QUEUE_PAGE_SIZE && (
        <p className="text-sm text-muted">
          Showing the oldest {APPROVAL_QUEUE_PAGE_SIZE} Pending Approvals. Decide these to see the rest.
        </p>
      )}
    </>
  );
}
