"use client";

import { useActionState } from "react";
import type { TaskActionFormAction, TaskActionFormState } from "./actions";

const INITIAL_STATE: TaskActionFormState = {};

interface TaskActionFormProps {
  action: TaskActionFormAction;
  label: string;
  // Asked before the action runs, as it can't be undone.
  confirmation: string;
}

// One button that cancels a Task or discards a Review; the server decides whether it may.
export function TaskActionForm({ action, label, confirmation }: TaskActionFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(confirmation)) event.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      <button type="submit" disabled={pending} className="btn btn-danger">
        {pending ? "Working…" : label}
      </button>
      {state.message && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
    </form>
  );
}
