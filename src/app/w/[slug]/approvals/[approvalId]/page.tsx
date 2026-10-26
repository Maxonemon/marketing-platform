import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { ExecutionStatus } from "@/generated/prisma/client";
import { getApproval, type ApprovalDetail } from "@/lib/app/approvals";
import type { WorkspaceSummary } from "@/lib/app/workspaces";
import { CHANNEL_LABELS, CONTENT_TYPE_LABELS } from "@/lib/content-options";
import { MAX_EXECUTION_ATTEMPTS } from "@/lib/workflows/execution-service";
import type { ProposedActionPayload } from "@/lib/workflows/proposed-action-payload";
import { requireWorkspace } from "../../require-workspace";
import { RuleViolations } from "../../rule-violations";
import { taskTitle } from "../../tasks/task-display";
import { Timestamp } from "../../timestamp";
import { approveAction, rejectAction, resubmitAction } from "../actions";
import { APPROVAL_STATUS_LABELS } from "../approval-display";
import { ApproveForm } from "./approve-form";
import { RejectForm } from "./reject-form";
import { ResubmitForm } from "./resubmit-form";

const EXECUTION_STATUS_LABELS: Record<ExecutionStatus, string> = {
  STARTED: "Started",
  SUCCEEDED: "Succeeded",
  FAILED: "Failed",
  UNCERTAIN: "May have gone out",
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
        <h1>Approval: {taskTitle(task)}</h1>
        <p>Status: {APPROVAL_STATUS_LABELS[approval.status]}</p>
        <span className="text-muted">
          Submitted by {proposedAction.createdBy} <Timestamp date={proposedAction.createdAt} />
          {approval.decidedBy && approval.decidedAt && (
            <>
              {" "}
              · decided by {approval.decidedBy} <Timestamp date={approval.decidedAt} />
            </>
          )}
          {(approval.status === "PENDING" || approval.status === "EXPIRED") && (
            <>
              {" "}
              · {approval.status === "PENDING" ? "expires" : "expired"} <Timestamp date={approval.expiresAt} />
            </>
          )}
        </span>
        {approval.comment && (
          <p className="wrap-break-word whitespace-pre-wrap">
            Comment: <q>{approval.comment}</q>
          </p>
        )}
        {approval.supersededById && (
          <Link href={`/w/${workspace.slug}/approvals/${approval.supersededById}`} className="link">
            The content was edited after this was submitted, so it will never be executed: view the new Approval
          </Link>
        )}
        {approval.supersedesId && (
          <Link href={`/w/${workspace.slug}/approvals/${approval.supersedesId}`} className="link">
            This replaces an earlier version of the content: view it
          </Link>
        )}
        {approval.resubmissionOfId && (
          <Link href={`/w/${workspace.slug}/approvals/${approval.resubmissionOfId}`} className="link">
            This resubmits a rejected Approval: view it
          </Link>
        )}
      </div>
      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">Proposed Action</h2>
        <p className="text-sm text-muted">
          Exactly what would be executed. It never changes: an edit makes a new Proposed Action that needs a new approval.{" "}
          <Link href={`/w/${workspace.slug}/content/${approval.contentAsset.id}`} className="link">
            Edit the content or see its history
          </Link>
        </p>
        {proposedAction.payload ? (
          <ProposedActionFields payload={proposedAction.payload} payloadHash={proposedAction.payloadHash} />
        ) : (
          <p role="alert" className="text-sm text-danger">
            The stored Proposed Action no longer matches its hash, so it will never be executed.
          </p>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">Brand rules</h2>
        <p className="text-sm text-muted">Checked on the proposed text when it was submitted. Warnings only: you decide.</p>
        <RuleViolations violations={proposedAction.violations} />
      </section>
      {approval.status === "PENDING" && <Decision approval={approval} workspace={workspace} />}
      {approval.status === "REJECTED" && <Resubmission approval={approval} workspace={workspace} />}
      <section className="flex flex-col gap-2 text-sm">
        <h2 className="text-base font-semibold">Execution</h2>
        <Executions approval={approval} />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">Context</h2>
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
    return <p className="text-sm text-muted">Waiting for an Owner or Admin to decide.</p>;
  }
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">Decision</h2>
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
      <h2 className="text-base font-semibold">Resubmit</h2>
      <p className="text-sm text-muted">
        Proposes the Content Asset, as it is now, as a new Proposed Action with a new Pending Approval. This rejected
        one stays as it is. To change the content first,{" "}
        <Link href={`/w/${workspace.slug}/content/${approval.contentAsset.id}`} className="link">
          edit it
        </Link>{" "}
        instead: the edit is resubmitted.
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
        <Link href={`/w/${workspaceSlug}/brands/${task.brand.id}`} className="link">
          {task.brand.name}
        </Link>
      </dd>
      <dt className="font-medium">Task</dt>
      <dd>
        <Link href={`/w/${workspaceSlug}/tasks/${task.id}`} className="link">
          {taskTitle(task)}
        </Link>
      </dd>
      <dt className="font-medium">Content Asset</dt>
      <dd className="flex flex-col gap-1">
        <span>Variant {contentAsset.variant}, the editable draft it was proposed from, as it is now:</span>
        {contentAsset.subject && <span className="wrap-break-word text-muted">Subject: {contentAsset.subject}</span>}
        <span className="wrap-break-word whitespace-pre-wrap text-muted">{contentAsset.body}</span>
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
      <dd className="wrap-break-word">{payload.audience ?? <em className="text-muted">None</em>}</dd>
      <dt className="font-medium">Timing</dt>
      <dd>{TIMING_LABELS[payload.timing.kind]}</dd>
      {payload.content.subject && (
        <>
          <dt className="font-medium">Subject</dt>
          <dd className="wrap-break-word rounded-md border border-line bg-subtle p-3">{payload.content.subject}</dd>
        </>
      )}
      <dt className="font-medium">Content</dt>
      <dd className="wrap-break-word whitespace-pre-wrap rounded-md border border-line bg-subtle p-3">{payload.content.body}</dd>
      <dt className="font-medium">Payload hash</dt>
      <dd className="font-mono text-xs break-all text-muted">{payloadHash}</dd>
    </dl>
  );
}

interface ExecutionsProps {
  approval: ApprovalDetail;
}

// Every attempt with its result or error, then what happens next.
function Executions({ approval }: ExecutionsProps) {
  if (approval.executions.length === 0) {
    return approval.status === "APPROVED" ? (
      <p className="text-muted">Executing in the background. Refresh to see the result.</p>
    ) : (
      <p className="text-muted">Nothing is executed until the Proposed Action is approved.</p>
    );
  }
  const last = approval.executions.at(-1);
  const willRetry = last?.status === "FAILED" && last.attempt < MAX_EXECUTION_ATTEMPTS && approval.status === "APPROVED";
  return (
    <>
      <ol className="flex flex-col gap-1">
        {approval.executions.map((execution) => (
          <li key={execution.id} className="wrap-break-word">
            Attempt {execution.attempt}: {EXECUTION_STATUS_LABELS[execution.status]}{" "}
            <Timestamp date={execution.finishedAt ?? execution.startedAt} className="text-muted" />
            {execution.error && <span className="text-danger"> {execution.error}</span>}
            {execution.result !== null && (
              <span className="font-mono text-xs text-muted"> {JSON.stringify(execution.result)}</span>
            )}
          </li>
        ))}
      </ol>
      {willRetry && <p className="text-muted">Retrying in the background with the same approval. Refresh to see the result.</p>}
    </>
  );
}
