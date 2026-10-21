"use client";

import { useActionState } from "react";
import type { ApproveFormAction, ApproveFormState } from "../actions";

const INITIAL_STATE: ApproveFormState = {};

interface ApproveFormProps {
  action: ApproveFormAction;
}

// Shown only to Owners and Admins; the server refuses anyone else whatever the page shows.
export function ApproveForm({ action }: ApproveFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      {state.message && <p role="alert" className="text-sm text-red-600">{state.message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-foreground px-3 py-2 text-background disabled:opacity-50"
      >
        Approve and execute
      </button>
    </form>
  );
}
