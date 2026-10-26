import Link from "next/link";
import { Fragment } from "react";
import type { ActivityEntry, BrandFieldChange, NotificationKind } from "@/lib/app/activity-log";
import type { BrandField } from "@/lib/app/brand-fields";
import { ROLE_LABELS } from "../members/role-display";
import { Timestamp } from "../timestamp";

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
  INTEGRATION_CONNECTED: "connected Slack",
  INTEGRATION_UPDATED: "changed the Slack webhook URL",
  INTEGRATION_REMOVED: "removed Slack",
  INTEGRATION_TESTED: "sent a Slack test message",
  NOTIFICATION_FAILED: "couldn't send a Slack notification about",
  TASK_CANCELLED: "cancelled a queued content Task for",
  REVIEW_DISCARDED: "discarded a Review without submitting it for",
};

export const EVENT_LABELS: Record<ActivityEntry["event"], string> = {
  BRAND_CREATED: "Brand created",
  BRAND_UPDATED: "Brand updated",
  TASK_FAILED: "Task failed",
  PROPOSED_ACTION_SUBMITTED: "Submitted for approval",
  APPROVAL_APPROVED: "Approved",
  APPROVAL_REJECTED: "Rejected",
  APPROVAL_SUPERSEDED: "Superseded",
  APPROVAL_EXPIRED: "Expired",
  EXECUTION_SUCCEEDED: "Execution succeeded",
  EXECUTION_FAILED: "Execution failed",
  MEMBER_INVITED: "Member invited",
  MEMBER_JOINED: "Member joined",
  MEMBER_ROLE_CHANGED: "Role changed",
  MEMBER_REMOVED: "Member removed",
  INTEGRATION_CONNECTED: "Slack connected",
  INTEGRATION_UPDATED: "Slack updated",
  INTEGRATION_REMOVED: "Slack removed",
  INTEGRATION_TESTED: "Slack tested",
  NOTIFICATION_FAILED: "Notification failed",
  TASK_CANCELLED: "Task cancelled",
  REVIEW_DISCARDED: "Review discarded",
};

const NOTIFICATION_LABELS: Record<NotificationKind, string> = {
  APPROVAL_PENDING: "a new Pending Approval",
  REVIEW_READY: "a Review being ready",
  TASK_FAILED: "a failed Task",
  EXECUTION_FAILED: "a failed Execution",
};

interface ActivityItemProps {
  entry: ActivityEntry;
  workspaceSlug: string;
}

export function ActivityItem({ entry, workspaceSlug }: ActivityItemProps) {
  return (
    <li className="flex flex-col gap-1 px-4 py-3 text-sm">
      <p className="wrap-break-word">
        <span className="font-medium">{entry.actorName ?? "System"}</span> {EVENT_TEXT[entry.event]}{" "}
        <MembershipChange entry={entry} />{" "}
        {entry.brand && (
          <Link href={`/w/${workspaceSlug}/brands/${entry.brand.id}`} className="link">
            {entry.brand.name}
          </Link>
        )}
      </p>
      <Timestamp date={entry.createdAt} className="text-xs text-muted" />
      {entry.approvalId && (
        <Link href={`/w/${workspaceSlug}/approvals/${entry.approvalId}`} className="link">
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
        <Link href={`/w/${workspaceSlug}/approvals/${entry.details.supersededById}`} className="link">
          View the new Approval
        </Link>
      )}
      {entry.event === "EXECUTION_FAILED" && (
        <p className="wrap-break-word">
          Attempt {entry.details.attempt}: {entry.details.error}
          {entry.details.final && " No retry follows."}
        </p>
      )}
      {entry.event === "INTEGRATION_TESTED" && (
        <p className="wrap-break-word">{entry.details.error === null ? "It went out." : `It failed: ${entry.details.error}`}</p>
      )}
      {entry.event === "NOTIFICATION_FAILED" && (
        <p className="wrap-break-word text-muted">
          About {NOTIFICATION_LABELS[entry.details.notification]}: {entry.details.error}
        </p>
      )}
      {(entry.event === "TASK_CANCELLED" || entry.event === "REVIEW_DISCARDED") && entry.taskId && (
        <Link href={`/w/${workspaceSlug}/tasks/${entry.taskId}`} className="link self-start">
          View the Task
        </Link>
      )}
      {entry.event === "TASK_FAILED" && (
        <p className="wrap-break-word">
          {entry.details.error}{" "}
          {entry.taskId && (
            <Link href={`/w/${workspaceSlug}/tasks/${entry.taskId}`} className="link">
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
  if (value === null || value.length === 0) return <em className="text-muted">empty</em>;
  if (typeof value === "string") return <q>{value}</q>;
  return value.map((entry, index) => (
    <Fragment key={index}>
      {index > 0 && ", "}
      <q>{entry}</q>
    </Fragment>
  ));
}
