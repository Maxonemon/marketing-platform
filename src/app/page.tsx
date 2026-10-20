import { redirect } from "next/navigation";
import { Suspense } from "react";
import { listMyWorkspaces } from "@/lib/app/workspaces";
import { requireActor } from "@/lib/session";

// Entry point: signed out → sign-in; no Workspace yet → create one; otherwise → the first Workspace.
export default function HomePage() {
  return (
    <Suspense fallback={<p className="p-6">Loading…</p>}>
      <RedirectToWorkspace />
    </Suspense>
  );
}

async function RedirectToWorkspace(): Promise<never> {
  const actor = await requireActor();
  const [first] = await listMyWorkspaces(actor);
  redirect(first ? `/w/${first.slug}` : "/workspaces/new");
}
