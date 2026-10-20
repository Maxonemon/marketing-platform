import { CreateWorkspaceForm } from "./create-workspace-form";

export default function NewWorkspacePage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Create your Workspace</h1>
        <p className="text-sm text-zinc-600">Your business or agency. You will be its Owner.</p>
      </div>
      <CreateWorkspaceForm />
    </main>
  );
}
