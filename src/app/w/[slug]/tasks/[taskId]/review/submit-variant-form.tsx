"use client";

import { useActionState } from "react";
import { AudienceField } from "../../../audience-field";
import type { SubmitReviewFormAction, SubmitReviewFormState } from "../../actions";

const INITIAL_STATE: SubmitReviewFormState = {};

interface SubmitVariantFormProps {
  action: SubmitReviewFormAction;
  contentAssetId: string;
  variant: number;
}

// Picks one Variant, as last saved, and submits it for approval to the audience given.
// On success the action redirects to the new Approval; on failure the state carries
// the reason.
export function SubmitVariantForm({ action, contentAssetId, variant }: SubmitVariantFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="contentAssetId" value={contentAssetId} />
      <AudienceField audience={state.audience ?? ""} errors={state.fieldErrors?.audience} />
      {state.message && !state.fieldErrors?.audience && <p role="alert" className="text-sm text-danger">{state.message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary"
      >
        Submit Variant {variant} for approval
      </button>
    </form>
  );
}
