import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { SignOutButton } from "./sign-out-button";

interface WorkspaceLayoutProps {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}

// The menu shared by every Workspace page. It shows only links; each page checks
// that the caller is a member before reading anything.
export default function WorkspaceLayout({ children, params }: WorkspaceLayoutProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
      <header className="flex items-center gap-4 border-b border-zinc-500/30 pb-3 text-sm">
        <Suspense fallback={null}>
          <WorkspaceMenu params={params} />
        </Suspense>
        <div className="ml-auto">
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
      <Link href={`/w/${slug}/activity`}>Activity Log</Link>
    </nav>
  );
}
