import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment, Suspense } from "react";
import { ACTIVITY_LOG_PAGE_SIZE, listActivity, type ActivityEntry, type BrandFieldChange } from "@/lib/app/activity-log";
import type { BrandField } from "@/lib/app/brand-fields";
import { ROLE_LABELS } from "../members/role-display";
import { requireWorkspace } from "../require-workspace";
import { Timestamp } from "../timestamp";

interface ActivityLogPageProps {
  params: Promise<{ slug: string }>;
}

export default function ActivityLogPage({ params }: ActivityLogPageProps) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <ActivityLog params={params} />
    </Suspense>
  );
}

async function ActivityLog({ params }: ActivityLogPageProps) {
  const { slug } = await params;
  const { actor, workspace } = await requireWorkspace(slug);
  const result = await listActivity(actor, workspace.id);
  if (!result.ok) notFound();
  const entries = result.value;

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Activity Log</h1>
        <p className="text-sm text-zinc-500">Who did what in this Workspace, newest first. Entries can never be edited or deleted.</p>
      </div>
      {entries.length === 0 ? (
        <p className="text-zinc-500">Nothing has happened yet.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-zinc-500/30">
          {entries.map((entry) => (
            <ActivityItem key={entry.id} entry={entry} workspaceSlug={workspace.slug} />
          ))}
        </ol>
      )}
      {entries.length === ACTIVITY_LOG_PAGE_SIZE && (
        <p className="text-sm text-zinc-500">Showing the latest {ACTIVITY_LOG_PAGE_SIZE} entries.</p>
      )}
    </>
  );
}

const EVENT_TEXT: Record<ActivityEntry["event"], string> = {
  BRAND_CREATED: "created the Brand",
  BRAND_UPDATED: "changed the settings of",
  TASK_FAILED: "recorded a failed content Task for",
  PROPOSED_ACTION_SUBMITTED: "submitted content for approval for",
  APPROVAL_APPROVED: "approved a Proposed Action for",
  APPROVAL_REJECTED: "rejected a Proposed Action for",
  APPROVAL_SUPERSEDED: "replaced a Proposed Action with an edited one for",
  APPROVAL_EXPIRED: "expired a Proposed Action nobody decided within 7 days for",
  EXECUTION_SUCCEEDED: "executed an approved Proposed Action for",
  EXECUTION_FAILED: "recorded a failed Execution attempt for",
  MEMBER_INVITED: "invited someone to the Workspace:",
  MEMBER_JOINED: "joined the Workspace from an invitation:",
  MEMBER_ROLE_CHANGED: "changed a member's role:",
  MEMBER_REMOVED: "removed a member:",
};

interface ActivityItemProps {
  entry: ActivityEntry;
  workspaceSlug: string;
}

function ActivityItem({ entry, workspaceSlug }: ActivityItemProps) {
  return (
    <li className="flex flex-col gap-1 py-3 text-sm">
      <p>
        <span className="font-medium">{entry.actorName ?? "System"}</span> {EVENT_TEXT[entry.event]}{" "}
        <MembershipChange entry={entry} />{" "}
        {entry.brand && (
          <Link href={`/w/${workspaceSlug}/brands/${entry.brand.id}`} className="underline">
            {entry.brand.name}
          </Link>
        )}
      </p>
      <Timestamp date={entry.createdAt} className="text-zinc-500" />
      {entry.approvalId && (
        <Link href={`/w/${workspaceSlug}/approvals/${entry.approvalId}`} className="underline">
          View the Approval
        </Link>
      )}
      {entry.event === "BRAND_UPDATED" && <ChangeList changes={entry.details.changes} />}
      {entry.event === "APPROVAL_REJECTED" && (
        <p className="wrap-break-word whitespace-pre-wrap">
          <q>{entry.details.comment}</q>
        </p>
      )}
      {entry.event === "APPROVAL_SUPERSEDED" && (
        <Link href={`/w/${workspaceSlug}/approvals/${entry.details.supersededById}`} className="underline">
          View the new Approval
        </Link>
      )}
      {entry.event === "EXECUTION_FAILED" && (
        <p className="wrap-break-word">
          Attempt {entry.details.attempt}: {entry.details.error}
          {entry.details.final && " No retry follows."}
        </p>
      )}
      {entry.event === "TASK_FAILED" && (
        <p className="wrap-break-word">
          {entry.details.error}{" "}
          {entry.taskId && (
            <Link href={`/w/${workspaceSlug}/tasks/${entry.taskId}`} className="underline">
              View the Task
            </Link>
          )}
        </p>
      )}
    </li>
  );
}

interface MembershipChangeProps {
  entry: ActivityEntry;
}

// Who a membership entry was about, and the role.
function MembershipChange({ entry }: MembershipChangeProps) {
  switch (entry.event) {
    case "MEMBER_INVITED":
    case "MEMBER_JOINED":
      return `${entry.details.email} as ${ROLE_LABELS[entry.details.role]}`;
    case "MEMBER_ROLE_CHANGED":
      return `${entry.details.name} (${entry.details.email}), ${ROLE_LABELS[entry.details.from]} → ${ROLE_LABELS[entry.details.to]}`;
    case "MEMBER_REMOVED": {
      const { name, email, role, invitationsCancelled } = entry.details;
      const cancelled = invitationsCancelled > 0 ? `; ${invitationsCancelled} pending invitation(s) cancelled` : "";
      return `${name} (${email}), ${ROLE_LABELS[role]}${cancelled}`;
    }
    default:
      return null;
  }
}

// Typed by the Brand fields, so adding a setting without a label fails the build.
const FIELD_LABELS: Record<BrandField, string> = {
  name: "Name",
  websiteUrl: "Website",
  industry: "Industry",
  audience: "Audience",
  voice: "Voice",
  offers: "Offers",
  keywords: "Keywords",
  prohibitedPhrases: "Prohibited words or phrases",
  requiredDisclaimers: "Required disclaimers",
};

interface ChangeListProps {
  changes: BrandFieldChange[];
}

function ChangeList({ changes }: ChangeListProps) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      {changes.map(({ field, from, to }) => (
        <Fragment key={field}>
          <dt className="font-medium">{FIELD_LABELS[field]}</dt>
          <dd className="wrap-break-word whitespace-pre-wrap">
            <ChangedValue value={from} /> → <ChangedValue value={to} />
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

interface ChangedValueProps {
  value: BrandFieldChange["from"];
}

// A text setting, or a list setting's entries one after another.
function ChangedValue({ value }: ChangedValueProps) {
  if (value === null || value.length === 0) return <em className="text-zinc-500">empty</em>;
  if (typeof value === "string") return <q>{value}</q>;
  return value.map((entry, index) => (
    <Fragment key={index}>
      {index > 0 && ", "}
      <q>{entry}</q>
    </Fragment>
  ));
}
