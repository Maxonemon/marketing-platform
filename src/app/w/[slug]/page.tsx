import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDashboard, type Dashboard } from "@/lib/app/dashboard";
import { ActivityItem } from "./activity/activity-item";
import { requireWorkspace } from "./require-workspace";
import { TaskStatusBadge, taskTitle } from "./tasks/task-display";
import { Timestamp } from "./timestamp";
import { EmptyState, PageHeader, PageSkeleton, Section } from "./ui";

interface DashboardPageProps {
  params: Promise<{ slug: string }>;
}

export default function DashboardPage({ params }: DashboardPageProps) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DashboardView params={params} />
    </Suspense>
  );
}

// Where a member lands after signing in: what waits for a person, what went wrong, what happened.
async function DashboardView({ params }: DashboardPageProps) {
  const { slug } = await params;
  const { actor, workspace } = await requireWorkspace(slug);
  const result = await getDashboard(actor, workspace.id);
  if (!result.ok) notFound();
  const dashboard = result.value;
  const base = `/w/${workspace.slug}`;
  const waiting = dashboard.openReviewCount + dashboard.pendingApprovalCount;

  return (
    <>
      <PageHeader
        title={workspace.name}
        description={waiting === 0 ? "Nothing is waiting on you." : `${waiting} item${waiting === 1 ? "" : "s"} waiting on a person.`}
        actions={
          <Link href={`${base}/brands`} className="btn btn-primary">
            Request content
          </Link>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Counter href={`${base}/tasks?status=IN_REVIEW`} count={dashboard.openReviewCount} label="Open Reviews" hint="Pick a Variant and submit it" />
        <Counter href={`${base}/approvals`} count={dashboard.pendingApprovalCount} label="Pending Approvals" hint="An Owner or Admin decides" />
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Open Reviews" aside={<ViewAll href={`${base}/tasks?status=IN_REVIEW`} count={dashboard.openReviewCount} shown={dashboard.openReviews.length} />}>
          <OpenReviews dashboard={dashboard} base={base} />
        </Section>
        <Section title="Pending Approvals" aside={<ViewAll href={`${base}/approvals`} count={dashboard.pendingApprovalCount} shown={dashboard.pendingApprovals.length} />}>
          <PendingApprovals dashboard={dashboard} base={base} />
        </Section>
      </div>
      {dashboard.recentFailures.length > 0 && (
        <Section title="Recent failures">
          <ol className="surface flex flex-col divide-y divide-line border-danger/30">
            {dashboard.recentFailures.map((entry) => (
              <ActivityItem key={entry.id} entry={entry} workspaceSlug={workspace.slug} />
            ))}
          </ol>
        </Section>
      )}
      <Section title="Recent activity" aside={<Link href={`${base}/activity`} className="link">Activity Log</Link>}>
        {dashboard.recentActivity.length === 0 ? (
          <EmptyState title="Nothing has happened yet.">
            Start by adding a{" "}
            <Link href={`${base}/brands`} className="link">
              Brand
            </Link>{" "}
            with its voice and rules.
          </EmptyState>
        ) : (
          <ol className="surface flex flex-col divide-y divide-line">
            {dashboard.recentActivity.map((entry) => (
              <ActivityItem key={entry.id} entry={entry} workspaceSlug={workspace.slug} />
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}

interface CounterProps {
  href: string;
  count: number;
  label: string;
  hint: string;
}

function Counter({ href, count, label, hint }: CounterProps) {
  return (
    <Link
      href={href}
      className="surface group flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:border-accent/40"
    >
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted">{hint}</span>
      </span>
      <span className={`font-mono text-3xl font-semibold tabular-nums ${count > 0 ? "text-accent" : "text-muted"}`}>{count}</span>
    </Link>
  );
}

function ViewAll({ href, count, shown }: { href: string; count: number; shown: number }) {
  if (count <= shown) return null;
  return (
    <Link href={href} className="link">
      View all {count}
    </Link>
  );
}

interface ListProps {
  dashboard: Dashboard;
  base: string;
}

function OpenReviews({ dashboard, base }: ListProps) {
  if (dashboard.openReviews.length === 0) {
    return <EmptyState title="No open Reviews.">New drafts land here when the agent finishes.</EmptyState>;
  }
  return (
    <ul className="surface flex flex-col divide-y divide-line overflow-hidden">
      {dashboard.openReviews.map((task) => (
        <li key={task.id}>
          <Link href={`${base}/tasks/${task.id}/review`} className="flex items-start justify-between gap-3 px-4 py-3 text-sm hover:bg-subtle">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">{taskTitle(task)}</span>
              <span className="truncate text-muted">{task.input.brief}</span>
            </span>
            <TaskStatusBadge status={task.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function PendingApprovals({ dashboard, base }: ListProps) {
  if (dashboard.pendingApprovals.length === 0) {
    return <EmptyState title="Nothing is waiting for a decision." />;
  }
  return (
    <ul className="surface flex flex-col divide-y divide-line overflow-hidden">
      {dashboard.pendingApprovals.map((approval) => (
        <li key={approval.id}>
          <Link href={`${base}/approvals/${approval.id}`} className="flex flex-col gap-0.5 px-4 py-3 text-sm hover:bg-subtle">
            <span className="font-medium">{taskTitle(approval.task)}</span>
            <span className="text-xs text-muted">
              Submitted by {approval.submittedBy}, <Timestamp date={approval.submittedAt} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
