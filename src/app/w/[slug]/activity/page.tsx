import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ACTIVITY_EVENTS, ACTIVITY_LOG_PAGE_SIZE, listActivity, type ActivityFiltersInput } from "@/lib/app/activity-log";
import { listBrands } from "@/lib/app/brands";
import { FilterBar, FilterField, readFilters, type SearchParams } from "../filters";
import { requireWorkspace } from "../require-workspace";
import { EmptyState, PageHeader, PageSkeleton } from "../ui";
import { ActivityItem, EVENT_LABELS } from "./activity-item";

interface ActivityLogPageProps {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}

const FILTER_KEYS = ["event", "brandId", "from", "to"] as const;

export default function ActivityLogPage(props: ActivityLogPageProps) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ActivityLog {...props} />
    </Suspense>
  );
}

async function ActivityLog({ params, searchParams }: ActivityLogPageProps) {
  const { slug } = await params;
  const { actor, workspace } = await requireWorkspace(slug);
  const filters = await readFilters(searchParams, FILTER_KEYS);
  const [result, brands] = await Promise.all([
    listActivity(actor, workspace.id, filters as ActivityFiltersInput),
    listBrands(actor, workspace.id),
  ]);
  if (!brands.ok) notFound();
  if (!result.ok && result.error.code !== "INVALID_INPUT") notFound();
  const isFiltered = Object.keys(filters).length > 0;

  return (
    <>
      <PageHeader
        title="Activity Log"
        description="Who did what in this Workspace, newest first. Entries can never be edited or deleted."
      />
      <FilterBar clearHref={`/w/${workspace.slug}/activity`} isFiltered={isFiltered}>
        <FilterField label="Event">
          <select name="event" defaultValue={filters.event ?? ""} className="input">
            <option value="">All events</option>
            {ACTIVITY_EVENTS.map((event) => (
              <option key={event} value={event}>
                {EVENT_LABELS[event]}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Brand">
          <select name="brandId" defaultValue={filters.brandId ?? ""} className="input">
            <option value="">All Brands</option>
            {brands.value.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="From">
          <input type="date" name="from" defaultValue={filters.from ?? ""} className="input" />
        </FilterField>
        <FilterField label="To">
          <input type="date" name="to" defaultValue={filters.to ?? ""} className="input" />
        </FilterField>
      </FilterBar>
      {!result.ok ? (
        <p role="alert" className="text-sm text-danger">
          {result.error.message} {Object.values(result.error.fieldErrors ?? {}).flat().join(" ")}
        </p>
      ) : result.value.length === 0 ? (
        <EmptyState title={isFiltered ? "No entries match these filters." : "Nothing has happened yet."}>
          {isFiltered ? "Widen the dates or clear the filters." : "Entries appear as people and agents work."}
        </EmptyState>
      ) : (
        <ol className="surface flex flex-col divide-y divide-line">
          {result.value.map((entry) => (
            <ActivityItem key={entry.id} entry={entry} workspaceSlug={workspace.slug} />
          ))}
        </ol>
      )}
      {result.ok && result.value.length === ACTIVITY_LOG_PAGE_SIZE && (
        <p className="text-sm text-muted">Showing the latest {ACTIVITY_LOG_PAGE_SIZE} entries. Narrow the filters to see older ones.</p>
      )}
    </>
  );
}
