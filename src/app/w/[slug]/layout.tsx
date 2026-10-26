import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { listMyWorkspaces } from "@/lib/app/workspaces";
import { requireActor } from "@/lib/session";
import { NavLinks } from "./nav-links";
import { SignOutButton } from "./sign-out-button";

interface WorkspaceLayoutProps {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}

// The shell shared by every Workspace page: a sidebar on wide screens, a top bar on
// narrow ones. It shows only links and the caller's own Workspaces; each page checks
// that the caller is a member before reading anything.
export default function WorkspaceLayout({ children, params }: WorkspaceLayoutProps) {
  return (
    <div className="flex w-full flex-1 flex-col md:flex-row">
      <aside className="flex flex-col gap-4 border-b border-line bg-canvas px-4 py-3 md:sticky md:top-0 md:h-dvh md:w-60 md:shrink-0 md:gap-8 md:border-r md:border-b-0 md:px-3 md:py-5">
        <div className="flex items-center justify-between gap-3 md:flex-col md:items-stretch">
          <Suspense fallback={<div className="h-9" />}>
            <WorkspaceSwitcher params={params} />
          </Suspense>
          <div className="md:hidden">
            <SignOutButton />
          </div>
        </div>
        <Suspense fallback={null}>
          <WorkspaceMenu params={params} />
        </Suspense>
        <div className="mt-auto hidden px-2.5 md:block">
          <SignOutButton />
        </div>
      </aside>
      <main className="mx-auto flex w-full max-w-5xl min-w-0 flex-1 flex-col gap-8 px-4 py-6 md:px-10 md:py-10">{children}</main>
    </div>
  );
}

async function WorkspaceMenu({ params }: Pick<WorkspaceLayoutProps, "params">) {
  const { slug } = await params;
  return <NavLinks slug={slug} />;
}

// The caller's own Workspaces, read through their memberships, so it never lists one
// they don't belong to. Opening another one switches to it.
async function WorkspaceSwitcher({ params }: Pick<WorkspaceLayoutProps, "params">) {
  const { slug } = await params;
  const workspaces = await listMyWorkspaces(await requireActor());
  const current = workspaces.find((workspace) => workspace.slug === slug);
  const name = current?.name ?? "Workspaces";
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-subtle [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-md bg-accent text-sm font-semibold text-accent-foreground">
          {name.charAt(0).toUpperCase()}
        </span>
        <span className="truncate text-sm font-semibold">{name}</span>
        <span aria-hidden className="ml-auto text-xs text-muted transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <ul className="absolute left-0 z-20 mt-1 flex min-w-56 flex-col rounded-lg border border-line bg-surface py-1 text-sm shadow-lg shadow-black/5">
        {workspaces.map((workspace) => (
          <li key={workspace.id}>
            <Link
              href={`/w/${workspace.slug}`}
              aria-current={workspace.slug === slug ? "page" : undefined}
              className="block px-3 py-1.5 hover:bg-subtle aria-[current=page]:font-medium"
            >
              {workspace.name}
            </Link>
          </li>
        ))}
        <li className="mt-1 border-t border-line pt-1">
          <Link href="/workspaces/new" className="block px-3 py-1.5 text-muted hover:bg-subtle hover:text-foreground">
            Create a Workspace
          </Link>
        </li>
      </ul>
    </details>
  );
}
