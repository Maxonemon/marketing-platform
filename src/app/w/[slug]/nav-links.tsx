"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavLinksProps {
  slug: string;
}

// Grouped by what a member does: the daily loop first, Workspace settings after.
const SECTIONS = [
  {
    label: "Work",
    links: [
      { path: "", label: "Dashboard" },
      { path: "/tasks", label: "Tasks" },
      { path: "/approvals", label: "Approvals" },
      { path: "/brands", label: "Brands" },
    ],
  },
  {
    label: "Workspace",
    links: [
      { path: "/activity", label: "Activity Log" },
      { path: "/members", label: "Members" },
      { path: "/integrations", label: "Integrations" },
    ],
  },
] as const;

// Marks the current section: the Dashboard only on its own page, others on their sub-pages too.
export function NavLinks({ slug }: NavLinksProps) {
  const pathname = usePathname();
  const base = `/w/${slug}`;
  const isCurrent = (path: string) => (path === "" ? pathname === base : pathname.startsWith(`${base}${path}`));

  return (
    <nav aria-label="Workspace" className="flex gap-1 overflow-x-auto md:flex-col md:gap-6 md:overflow-visible">
      {SECTIONS.map((section) => (
        <div key={section.label} className="flex gap-1 md:flex-col md:gap-0.5">
          <p className="hidden px-2.5 pb-1 text-xs font-medium text-muted md:block">{section.label}</p>
          {section.links.map(({ path, label }) => (
            <Link
              key={path}
              href={`${base}${path}`}
              aria-current={isCurrent(path) ? "page" : undefined}
              className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-subtle hover:text-foreground aria-[current=page]:bg-surface aria-[current=page]:font-medium aria-[current=page]:text-foreground aria-[current=page]:shadow-sm aria-[current=page]:ring-1 aria-[current=page]:ring-line"
            >
              {label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
