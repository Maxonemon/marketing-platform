import { Suspense } from "react";
import { requireActor } from "@/lib/session";
import { CreateWorkspaceForm } from "./create-workspace-form";

export default function NewWorkspacePage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col gap-1.5">
        <h1>Create your Workspace</h1>
        <p className="text-sm text-muted">Your business or agency. You will be its Owner.</p>
      </div>
      <div className="surface p-6">
        <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
          <SignedInForm />
        </Suspense>
      </div>
    </main>
  );
}

// The proxy only checks that a session cookie exists; this verifies the session itself.
async function SignedInForm() {
  await requireActor();
  return <CreateWorkspaceForm />;
}
