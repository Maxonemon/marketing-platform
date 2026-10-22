"use client";

import { useActionState } from "react";
import type { ResubmitFormAction, ResubmitFormState } from "../actions";

const INITIAL_STATE: ResubmitFormState = {};

interface ResubmitFormProps {
  action: ResubmitFormAction;
}

// Proposes a Rejected Approval's Content Asset again. On success the action redirects
// to the new Approval; on failure the state carries the reason.
export function ResubmitForm({ action }: ResubmitFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      {state.message && <p role="alert" className="text-sm text-red-600">{state.message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-foreground px-3 py-2 text-sm text-background disabled:opacity-50"
      >
        Resubmit for approval
      </button>
    </form>
  );
}
