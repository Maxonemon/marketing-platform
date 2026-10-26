import Link from "next/link";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  // A link back to the parent page, e.g. "All Tasks".
  back?: { href: string; label: string };
  // Shown on the right on wide screens, under the title on narrow ones.
  actions?: ReactNode;
}

export function PageHeader({ title, description, back, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3">
      {back && (
        <Link href={back.href} className="self-start text-sm text-muted hover:text-foreground">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="wrap-break-word">{title}</h1>
          {description && <div className="max-w-[65ch] text-sm leading-relaxed text-muted">{description}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

interface EmptyStateProps {
  title: string;
  children?: ReactNode;
}

// What an empty list says, with how to fill it.
export function EmptyState({ title, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-1.5 rounded-[10px] border border-dashed border-line px-5 py-8 text-sm">
      <p className="font-medium">{title}</p>
      {children && <div className="text-muted">{children}</div>}
    </div>
  );
}

// The loading state of a page: blocks in the shape of a header and a list.
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex animate-pulse flex-col gap-8 motion-reduce:animate-none">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-48 rounded-md bg-subtle" />
        <div className="h-4 w-80 max-w-full rounded-md bg-subtle" />
      </div>
      <div className="surface flex flex-col divide-y divide-line">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex flex-col gap-2 px-4 py-3.5">
            <div className="h-4 w-56 max-w-full rounded bg-subtle" />
            <div className="h-3 w-40 rounded bg-subtle" />
          </div>
        ))}
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  // e.g. a count or a "View all" link, after the title.
  aside?: ReactNode;
  children: ReactNode;
}

export function Section({ title, aside, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {aside && <div className="text-sm text-muted">{aside}</div>}
      </div>
      {children}
    </section>
  );
}
