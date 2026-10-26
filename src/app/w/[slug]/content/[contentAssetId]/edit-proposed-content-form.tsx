"use client";

import { useActionState } from "react";
import { AudienceField } from "../../audience-field";
import { ContentFields } from "../../content-fields";
import type { EditProposedContentFormAction, EditProposedContentFormState } from "../actions";

const INITIAL_STATE: EditProposedContentFormState = {};

interface EditProposedContentFormProps {
  action: EditProposedContentFormAction;
  // null for content types without a subject line.
  subject: string | null;
  body: string;
  audience: string | null;
}

// Edits submitted content. On success the action redirects to the new Approval; on
// failure the state keeps what was typed.
export function EditProposedContentForm({ action, subject, body, audience }: EditProposedContentFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);
  const values = state.values;

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <ContentFields
        subject={subject === null ? null : (values?.subject ?? subject)}
        body={values?.body ?? body}
        errors={state.fieldErrors}
      />
      <AudienceField audience={values?.audience ?? audience ?? ""} errors={state.fieldErrors?.audience} />
      {state.message && !state.fieldErrors && <p role="alert" className="text-sm text-danger">{state.message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary"
      >
        Submit the edit for approval
      </button>
    </form>
  );
}
