import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getWorkspaceBySlug } from "@/lib/app/workspaces";
import { requireActor } from "@/lib/session";
import { SignOutButton } from "./sign-out-button";

interface WorkspacePageProps {
  params: Promise<{ slug: string }>;
}

export default function WorkspacePage({ params }: WorkspacePageProps) {
  return (
    <Suspense fallback={<p className="p-6">Loading…</p>}>
      <WorkspaceHome params={params} />
    </Suspense>
  );
}

async function WorkspaceHome({ params }: WorkspacePageProps) {
  const actor = await requireActor();
  const { slug } = await params;
  const result = await getWorkspaceBySlug(actor, slug);
  if (!result.ok) notFound();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{result.value.name}</h1>
        <SignOutButton />
      </header>
      <p className="text-zinc-600">Nothing here yet. Brands and content arrive in the next tickets.</p>
    </main>
  );
}
