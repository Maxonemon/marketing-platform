"use client";

import { useActionState } from "react";
import { createWorkspaceAction, type CreateWorkspaceFormState } from "./actions";

const INITIAL_STATE: CreateWorkspaceFormState = {};

export function CreateWorkspaceForm() {
  const [state, formAction, pending] = useActionState(createWorkspaceAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input name="name" required maxLength={80} className="rounded border px-2 py-1.5" />
        <FieldError messages={state.fieldErrors?.name} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Slug (used in links, e.g. acme-agency)
        <input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" minLength={3} maxLength={48} className="rounded border px-2 py-1.5" />
        <FieldError messages={state.fieldErrors?.slug} />
      </label>
      {state.message && !state.fieldErrors && <p role="alert" className="text-sm text-red-600">{state.message}</p>}
      <button type="submit" disabled={pending} className="rounded bg-foreground px-3 py-2 text-background disabled:opacity-50">
        Create Workspace
      </button>
    </form>
  );
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <span role="alert" className="text-red-600">{messages.join(" ")}</span>;
}
