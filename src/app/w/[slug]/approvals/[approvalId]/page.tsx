import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { ApprovalStatus, ExecutionStatus } from "@/generated/prisma/client";
import { getApproval, type ApprovalDetail } from "@/lib/app/approvals";
import type { WorkspaceSummary } from "@/lib/app/workspaces";
import { CHANNEL_LABELS, CONTENT_TYPE_LABELS } from "@/lib/content-options";
import type { ProposedActionPayload } from "@/lib/workflows/proposed-action-payload";
import { requireWorkspace } from "../../require-workspace";
import { RuleViolations } from "../../rule-violations";
import { taskTitle } from "../../tasks/task-display";
import { Timestamp } from "../../timestamp";
import { approveAction, rejectAction, resubmitAction } from "../actions";
import { ApproveForm } from "./approve-form";
import { RejectForm } from "./reject-form";
import { ResubmitForm } from "./resubmit-form";

const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  SUPERSEDED: "Superseded",
};

const EXECUTION_STATUS_LABELS: Record<ExecutionStatus, string> = {
  STARTED: "Started",
  SUCCEEDED: "Succeeded",
  FAILED: "Failed",
};

const TIMING_LABELS: Record<ProposedActionPayload["timing"]["kind"], string> = {
  AS_SOON_AS_APPROVED: "As soon as approved",
};

interface ApprovalPageProps {
  params: Promise<{ slug: string; approvalId: string }>;
}

export default function ApprovalPage({ params }: ApprovalPageProps) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <ApprovalView params={params} />
    </Suspense>
  );
}

async function ApprovalView({ params }: ApprovalPageProps) {
  const { slug, approvalId } = await params;
  const { actor, workspace } = await requireWorkspace(slug);
  const result = await getApproval(actor, workspace.id, approvalId);
  if (!result.ok) notFound();
  const approval = result.value;
  const { proposedAction, task } = approval;

  return (
    <>
      <div className="flex flex-col gap-1 text-sm">
        <h1 className="text-2xl font-semibold">Approval: {taskTitle(task)}</h1>
        <p>Status: {APPROVAL_STATUS_LABELS[approval.status]}</p>
        <span className="text-zinc-500">
          Submitted by {proposedAction.createdBy} <Timestamp date={proposedAction.createdAt} />
          {approval.decidedBy && approval.decidedAt && (
            <>
              {" "}
              · decided by {approval.decidedBy} <Timestamp date={approval.decidedAt} />
            </>
          )}
        </span>
        {approval.comment && (
          <p className="wrap-break-word whitespace-pre-wrap">
            Comment: <q>{approval.comment}</q>
          </p>
        )}
        {approval.resubmissionOfId && (
          <Link href={`/w/${workspace.slug}/approvals/${approval.resubmissionOfId}`} className="underline">
            This resubmits a rejected Approval: view it
          </Link>
        )}
      </div>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Proposed Action</h2>
        <p className="text-sm text-zinc-500">Exactly what would be executed. It never changes: an edit needs a new approval.</p>
        {proposedAction.payload ? (
          <ProposedActionFields payload={proposedAction.payload} payloadHash={proposedAction.payloadHash} />
        ) : (
          <p role="alert" className="text-sm text-red-600">
            The stored Proposed Action no longer matches its hash, so it will never be executed.
          </p>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Brand rules</h2>
        <p className="text-sm text-zinc-500">Checked when the Variant was written. Warnings only: you decide.</p>
        <RuleViolations violations={approval.contentAsset.violations} />
      </section>
      {approval.status === "PENDING" && <Decision approval={approval} workspace={workspace} />}
      {approval.status === "REJECTED" && <Resubmission approval={approval} workspace={workspace} />}
      <section className="flex flex-col gap-2 text-sm">
        <h2 className="text-lg font-semibold">Execution</h2>
        <Executions approval={approval} />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Context</h2>
        <ApprovalContext approval={approval} workspaceSlug={workspace.slug} />
      </section>
    </>
  );
}

interface ApprovalActionsProps {
  approval: ApprovalDetail;
  workspace: WorkspaceSummary;
}

// Approve and reject, shown only to Owners and Admins while the Approval is Pending; the
// server enforces the same rules whatever the page shows. A Proposed Action that fails
// its hash check can only be rejected.
function Decision({ approval, workspace }: ApprovalActionsProps) {
  const isApprover = workspace.role === "OWNER" || workspace.role === "ADMIN";
  if (!isApprover) {
    return <p className="text-sm text-zinc-500">Waiting for an Owner or Admin to decide.</p>;
  }
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Decision</h2>
      {approval.proposedAction.payload && <ApproveForm action={approveAction.bind(null, workspace.id, approval.id)} />}
      <RejectForm action={rejectAction.bind(null, workspace.id, approval.id)} />
    </section>
  );
}

// After a rejection any member can resubmit the Content Asset, once.
function Resubmission({ approval, workspace }: ApprovalActionsProps) {
  if (approval.resubmittedAsId) {
    return (
      <Link href={`/w/${workspace.slug}/approvals/${approval.resubmittedAsId}`} className="text-sm underline">
        Resubmitted: view the new Approval
      </Link>
    );
  }
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Resubmit</h2>
      <p className="text-sm text-zinc-500">
        Proposes the Content Asset, as it is now, as a new Proposed Action with a new Pending Approval. This rejected
        one stays as it is.
      </p>
      <ResubmitForm action={resubmitAction.bind(null, workspace.id, workspace.slug, approval.id)} />
    </section>
  );
}

interface ApprovalContextProps {
  approval: ApprovalDetail;
  workspaceSlug: string;
}

// Where the Proposed Action came from: its Brand, Task and Content Asset.
function ApprovalContext({ approval: { task, contentAsset }, workspaceSlug }: ApprovalContextProps) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      <dt className="font-medium">Brand</dt>
      <dd>
        <Link href={`/w/${workspaceSlug}/brands/${task.brand.id}`} className="underline">
          {task.brand.name}
        </Link>
      </dd>
      <dt className="font-medium">Task</dt>
      <dd>
        <Link href={`/w/${workspaceSlug}/tasks/${task.id}`} className="underline">
          {taskTitle(task)}
        </Link>
      </dd>
      <dt className="font-medium">Content Asset</dt>
      <dd className="flex flex-col gap-1">
        <span>Variant {contentAsset.variant}, the editable draft it was proposed from, as it is now:</span>
        {contentAsset.subject && <span className="wrap-break-word text-zinc-500">Subject: {contentAsset.subject}</span>}
        <span className="wrap-break-word whitespace-pre-wrap text-zinc-500">{contentAsset.body}</span>
      </dd>
      <dt className="font-medium">Brief</dt>
      <dd className="wrap-break-word whitespace-pre-wrap">{task.input.brief}</dd>
    </dl>
  );
}

interface ProposedActionFieldsProps {
  payload: ProposedActionPayload;
  payloadHash: string;
}

function ProposedActionFields({ payload, payloadHash }: ProposedActionFieldsProps) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      <dt className="font-medium">Channel</dt>
      <dd>{CHANNEL_LABELS[payload.channel]}</dd>
      <dt className="font-medium">Content type</dt>
      <dd>{CONTENT_TYPE_LABELS[payload.contentType]}</dd>
      <dt className="font-medium">Audience</dt>
      <dd>{payload.audience ?? <em className="text-zinc-500">None: the Channel takes none</em>}</dd>
      <dt className="font-medium">Timing</dt>
      <dd>{TIMING_LABELS[payload.timing.kind]}</dd>
      {payload.content.subject && (
        <>
          <dt className="font-medium">Subject</dt>
          <dd className="wrap-break-word rounded border border-zinc-500/30 p-2">{payload.content.subject}</dd>
        </>
      )}
      <dt className="font-medium">Content</dt>
      <dd className="wrap-break-word whitespace-pre-wrap rounded border border-zinc-500/30 p-2">{payload.content.body}</dd>
      <dt className="font-medium">Payload hash</dt>
      <dd className="font-mono text-xs break-all text-zinc-500">{payloadHash}</dd>
    </dl>
  );
}

interface ExecutionsProps {
  approval: ApprovalDetail;
}

function Executions({ approval }: ExecutionsProps) {
  if (approval.executions.length === 0) {
    return approval.status === "APPROVED" ? (
      <p className="text-zinc-500">Executing in the background. Refresh to see the result.</p>
    ) : (
      <p className="text-zinc-500">Nothing is executed until the Proposed Action is approved.</p>
    );
  }
  return (
    <ol className="flex flex-col gap-1">
      {approval.executions.map((execution) => (
        <li key={execution.id}>
          Attempt {execution.attempt}: {EXECUTION_STATUS_LABELS[execution.status]}{" "}
          <Timestamp date={execution.finishedAt ?? execution.startedAt} className="text-zinc-500" />
          {execution.error && <span className="text-red-600"> {execution.error}</span>}
        </li>
      ))}
    </ol>
  );
}
