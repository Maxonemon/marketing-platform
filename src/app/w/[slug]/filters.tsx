import Link from "next/link";
import type { ReactNode } from "react";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// The filters a page was opened with: each key's first value, left out when empty. The
// application layer validates them; this only reads the query string.
export async function readFilters<Key extends string>(
  searchParams: SearchParams,
  keys: readonly Key[],
): Promise<Partial<Record<Key, string>>> {
  const params = await searchParams;
  const entries = keys.flatMap((key) => {
    const raw = params[key];
    const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    return value ? [[key, value] as const] : [];
  });
  return Object.fromEntries(entries) as Partial<Record<Key, string>>;
}

interface FilterBarProps {
  // Where "Clear" leads: the page without filters.
  clearHref: string;
  isFiltered: boolean;
  children: ReactNode;
}

// A plain GET form, so filters live in the URL and survive a reload or a shared link.
export function FilterBar({ clearHref, isFiltered, children }: FilterBarProps) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3">
      {children}
      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-secondary">
          Apply
        </button>
        {isFiltered && (
          <Link href={clearHref} className="text-sm text-muted hover:text-foreground">
            Clear
          </Link>
        )}
      </div>
    </form>
  );
}

interface FilterFieldProps {
  label: string;
  children: ReactNode;
}

export function FilterField({ label, children }: FilterFieldProps) {
  return (
    <label className="flex min-w-36 flex-col gap-1 text-xs font-medium text-muted">
      {label}
      {children}
    </label>
  );
}
