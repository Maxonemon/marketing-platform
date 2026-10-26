"use client";

import { useActionState } from "react";
import { ContentFields } from "../../../content-fields";
import type { EditVariantFormAction, EditVariantFormState } from "../../actions";

const INITIAL_STATE: EditVariantFormState = {};

interface EditVariantFormProps {
  action: EditVariantFormAction;
  // null for content types without a subject line.
  subject: string | null;
  body: string;
}

// Edits a Variant before it is submitted. Saving refreshes the Review, so the Brand rule
// warnings above are those of the edited text; on failure the state keeps what was typed.
export function EditVariantForm({ action, subject, body }: EditVariantFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);
  const values = state.values;

  return (
    <details className="flex flex-col gap-2" open={Boolean(values)}>
      <summary className="cursor-pointer self-start underline">Edit this Variant</summary>
      <form action={formAction} className="mt-2 flex flex-col gap-2">
        <ContentFields
          subject={subject === null ? null : (values?.subject ?? subject)}
          body={values?.body ?? body}
          errors={state.fieldErrors}
        />
        {state.message && !state.fieldErrors && <p role="alert" className="text-sm text-danger">{state.message}</p>}
        {state.saved && <p className="text-sm text-muted">Saved. The Brand rules were checked again.</p>}
        <button
          type="submit"
          disabled={pending}
          className="btn btn-secondary"
        >
          Save edit
        </button>
      </form>
    </details>
  );
}
