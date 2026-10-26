import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { listMyWorkspaces } from "@/lib/app/workspaces";
import { requireActor } from "@/lib/session";
import { SignOutButton } from "./sign-out-button";

interface WorkspaceLayoutProps {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}

// The menu shared by every Workspace page. It shows only links and the caller's own
// Workspaces; each page checks that the caller is a member before reading anything.
export default function WorkspaceLayout({ children, params }: WorkspaceLayoutProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
      <header className="flex items-center gap-4 border-b border-zinc-500/30 pb-3 text-sm">
        <Suspense fallback={null}>
          <WorkspaceMenu params={params} />
        </Suspense>
        <div className="ml-auto flex items-start gap-4">
          <Suspense fallback={null}>
            <WorkspaceSwitcher params={params} />
          </Suspense>
          <SignOutButton />
        </div>
      </header>
      <main className="flex flex-col gap-6">{children}</main>
    </div>
  );
}

async function WorkspaceMenu({ params }: Pick<WorkspaceLayoutProps, "params">) {
  const { slug } = await params;
  return (
    <nav className="flex gap-4">
      <Link href={`/w/${slug}`}>Home</Link>
      <Link href={`/w/${slug}/brands`}>Brands</Link>
      <Link href={`/w/${slug}/tasks`}>Tasks</Link>
      <Link href={`/w/${slug}/approvals`}>Approvals</Link>
      <Link href={`/w/${slug}/activity`}>Activity Log</Link>
      <Link href={`/w/${slug}/members`}>Members</Link>
      <Link href={`/w/${slug}/integrations`}>Integrations</Link>
    </nav>
  );
}

// The caller's own Workspaces, read through their memberships, so it never lists one
// they don't belong to. Opening another one switches to it.
async function WorkspaceSwitcher({ params }: Pick<WorkspaceLayoutProps, "params">) {
  const { slug } = await params;
  const workspaces = await listMyWorkspaces(await requireActor());
  const current = workspaces.find((workspace) => workspace.slug === slug);
  return (
    <details className="relative">
      <summary className="cursor-pointer">{current?.name ?? "Workspaces"}</summary>
      <ul className="absolute right-0 z-10 mt-1 flex min-w-48 flex-col rounded border border-zinc-500/30 bg-background py-1">
        {workspaces.map((workspace) => (
          <li key={workspace.id}>
            <Link
              href={`/w/${workspace.slug}`}
              aria-current={workspace.slug === slug ? "page" : undefined}
              className="block px-3 py-1 hover:bg-zinc-500/10 aria-[current=page]:font-medium"
            >
              {workspace.name}
            </Link>
          </li>
        ))}
        <li className="border-t border-zinc-500/30">
          <Link href="/workspaces/new" className="block px-3 py-1 hover:bg-zinc-500/10">
            Create a Workspace
          </Link>
        </li>
      </ul>
    </details>
  );
}
