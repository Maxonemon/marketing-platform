"use client";

import { useActionState } from "react";
import { APPROVAL_COMMENT_MAX_LENGTH } from "@/lib/limits";
import { Field, INPUT_CLASS } from "../../form-field";
import type { RejectFormAction, RejectFormState } from "../actions";

const INITIAL_STATE: RejectFormState = {};

interface RejectFormProps {
  action: RejectFormAction;
}

// Shown only to Owners and Admins; the server refuses anyone else whatever the page shows.
// On failure the state carries what was typed, so the comment is not lost.
export function RejectForm({ action }: RejectFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Field label="Comment: what the author should change" errors={state.fieldErrors?.comment}>
        <textarea
          name="comment"
          required
          rows={3}
          maxLength={APPROVAL_COMMENT_MAX_LENGTH}
          defaultValue={state.comment ?? ""}
          className={INPUT_CLASS}
        />
      </Field>
      {state.message && !state.fieldErrors && <p role="alert" className="text-sm text-red-600">{state.message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded border border-zinc-500/60 px-3 py-2 disabled:opacity-50"
      >
        Reject
      </button>
    </form>
  );
}
