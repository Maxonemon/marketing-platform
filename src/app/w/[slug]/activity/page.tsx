import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment, Suspense } from "react";
import { ACTIVITY_LOG_PAGE_SIZE, listActivity, type ActivityEntry, type FieldChange } from "@/lib/app/activity-log";
import { requireWorkspace } from "../require-workspace";

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
};

// Server time zones differ, so times are always shown in UTC.
const TIMESTAMP = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

interface ActivityItemProps {
  entry: ActivityEntry;
  workspaceSlug: string;
}

function ActivityItem({ entry, workspaceSlug }: ActivityItemProps) {
  return (
    <li className="flex flex-col gap-1 py-3 text-sm">
      <p>
        <span className="font-medium">{entry.actorName}</span> {EVENT_TEXT[entry.event]}{" "}
        {entry.brand && (
          <Link href={`/w/${workspaceSlug}/brands/${entry.brand.id}`} className="underline">
            {entry.brand.name}
          </Link>
        )}
      </p>
      <time dateTime={entry.createdAt.toISOString()} className="text-zinc-500">
        {TIMESTAMP.format(entry.createdAt)} UTC
      </time>
      {entry.event === "BRAND_UPDATED" && <ChangeList changes={entry.details.changes} />}
    </li>
  );
}

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  websiteUrl: "Website",
  industry: "Industry",
  audience: "Audience",
  voice: "Voice",
};

interface ChangeListProps {
  changes: FieldChange[];
}

function ChangeList({ changes }: ChangeListProps) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      {changes.map(({ field, from, to }) => (
        <Fragment key={field}>
          <dt className="font-medium">{FIELD_LABELS[field] ?? field}</dt>
          <dd className="wrap-break-word whitespace-pre-wrap">
            <ChangedValue text={from} /> → <ChangedValue text={to} />
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

interface ChangedValueProps {
  text: string | null;
}

function ChangedValue({ text }: ChangedValueProps) {
  return text === null ? <em className="text-zinc-500">empty</em> : <q>{text}</q>;
}
