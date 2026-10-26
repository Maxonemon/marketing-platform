"use client";

import { useActionState } from "react";
import { SLUG_MAX_LENGTH, SLUG_MIN_LENGTH, SLUG_PATTERN, WORKSPACE_NAME_MAX_LENGTH } from "@/lib/limits";
import { createWorkspaceAction, type CreateWorkspaceFormState } from "./actions";

const INITIAL_STATE: CreateWorkspaceFormState = {};

export function CreateWorkspaceForm() {
  const [state, formAction, pending] = useActionState(createWorkspaceAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input name="name" required maxLength={WORKSPACE_NAME_MAX_LENGTH} className="input" />
        <FieldError messages={state.fieldErrors?.name} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Slug (used in links, e.g. acme-agency)
        <input
          name="slug"
          required
          pattern={SLUG_PATTERN.source}
          minLength={SLUG_MIN_LENGTH}
          maxLength={SLUG_MAX_LENGTH}
          className="input"
        />
        <FieldError messages={state.fieldErrors?.slug} />
      </label>
      {state.message && !state.fieldErrors && <p role="alert" className="text-sm text-danger">{state.message}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary">
        Create Workspace
      </button>
    </form>
  );
}

interface FieldErrorProps {
  messages?: string[];
}

function FieldError({ messages }: FieldErrorProps) {
  if (!messages?.length) return null;
  return <span role="alert" className="text-danger">{messages.join(" ")}</span>;
}
