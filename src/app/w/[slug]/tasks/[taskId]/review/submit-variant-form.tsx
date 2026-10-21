"use client";

import { useActionState } from "react";
import type { SubmitReviewFormAction, SubmitReviewFormState } from "../../actions";

const INITIAL_STATE: SubmitReviewFormState = {};

interface SubmitVariantFormProps {
  action: SubmitReviewFormAction;
  contentAssetId: string;
  variant: number;
}

// Picks one Variant and submits it for approval. On success the action redirects to
// the new Approval; on failure the state carries the reason.
export function SubmitVariantForm({ action, contentAssetId, variant }: SubmitVariantFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="contentAssetId" value={contentAssetId} />
      {state.message && <p role="alert" className="text-sm text-red-600">{state.message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-foreground px-3 py-2 text-sm text-background disabled:opacity-50"
      >
        Submit Variant {variant} for approval
      </button>
    </form>
  );
}
