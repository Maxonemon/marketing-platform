import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { listBrands } from "@/lib/app/brands";
import { listTasks, TASK_HISTORY_PAGE_SIZE, TASK_STATUSES, type TaskFiltersInput } from "@/lib/app/tasks";
import { FilterBar, FilterField, readFilters, type SearchParams } from "../filters";
import { requireWorkspace } from "../require-workspace";
import { EmptyState, PageHeader, PageSkeleton } from "../ui";
import { TASK_STATUS_LABELS, TaskStatusBadge, TaskTimes, taskTitle } from "./task-display";

interface TaskHistoryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}

const FILTER_KEYS = ["brandId", "status"] as const;

export default function TaskHistoryPage(props: TaskHistoryPageProps) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TaskHistory {...props} />
    </Suspense>
  );
}

async function TaskHistory({ params, searchParams }: TaskHistoryPageProps) {
  const { slug } = await params;
  const { actor, workspace } = await requireWorkspace(slug);
  const filters = await readFilters(searchParams, FILTER_KEYS);
  const [result, brands] = await Promise.all([
    listTasks(actor, workspace.id, filters as TaskFiltersInput),
    listBrands(actor, workspace.id),
  ]);
  if (!brands.ok) notFound();
  if (!result.ok && result.error.code !== "INVALID_INPUT") notFound();
  const isFiltered = Object.keys(filters).length > 0;

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Every content request and what the agent did with it, newest first."
        actions={
          <Link href={`/w/${workspace.slug}/brands`} className="btn btn-primary">
            Request content
          </Link>
        }
      />
      <FilterBar clearHref={`/w/${workspace.slug}/tasks`} isFiltered={isFiltered}>
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
        <FilterField label="Status">
          <select name="status" defaultValue={filters.status ?? ""} className="input">
            <option value="">All statuses</option>
            {TASK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {TASK_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </FilterField>
      </FilterBar>
      {!result.ok ? (
        <p role="alert" className="text-sm text-danger">
          {result.error.message}
        </p>
      ) : result.value.length === 0 ? (
        <EmptyState title={isFiltered ? "No Tasks match these filters." : "No Tasks yet."}>
          {isFiltered ? (
            "Try another Brand or status."
          ) : (
            <>
              Open a{" "}
              <Link href={`/w/${workspace.slug}/brands`} className="link">
                Brand
              </Link>{" "}
              and request content: the agent writes three Variants for you to review.
            </>
          )}
        </EmptyState>
      ) : (
        <ul className="surface flex flex-col divide-y divide-line overflow-hidden">
          {result.value.map((task) => (
            <li key={task.id}>
              <Link
                href={`/w/${workspace.slug}/tasks/${task.id}`}
                className="flex items-start justify-between gap-4 px-4 py-3 text-sm transition-colors hover:bg-subtle"
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="font-medium">{taskTitle(task)}</span>
                  <span className="truncate text-muted">{task.input.brief}</span>
                  <span className="text-xs">
                    <TaskTimes task={task} />
                  </span>
                </span>
                <TaskStatusBadge status={task.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {result.ok && result.value.length === TASK_HISTORY_PAGE_SIZE && (
        <p className="text-sm text-muted">Showing the latest {TASK_HISTORY_PAGE_SIZE} Tasks. Narrow the filters to see older ones.</p>
      )}
    </>
  );
}
