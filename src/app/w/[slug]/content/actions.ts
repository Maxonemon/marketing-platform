"use server";

import { redirect } from "next/navigation";
import { contentFromForm } from "@/lib/app/content-edits";
import { editProposedContent, type ProposedContentInput } from "@/lib/app/content-assets";
import type { FieldErrors } from "@/lib/app/result";
import { requireActor } from "@/lib/session";

export interface EditProposedContentFormState {
  message?: string;
  fieldErrors?: FieldErrors;
  // What was typed, sent back on failure so the form keeps it.
  values?: ProposedContentInput;
}

export type EditProposedContentFormAction = (
  previous: EditProposedContentFormState,
  formData: FormData,
) => Promise<EditProposedContentFormState>;

// Proposes the edit, superseding the version it was made from, and opens the new
// Approval. Bound ids are trusted only as far as editProposedContent checks them
// (membership, an Approval scoped to the Workspace that can still be superseded). The
// bound slug only shapes the caller's own redirect, which always stays under /w/.
export async function editProposedContentAction(
  workspaceId: string,
  workspaceSlug: string,
  approvalId: string,
  _previous: EditProposedContentFormState,
  formData: FormData,
): Promise<EditProposedContentFormState> {
  const actor = await requireActor();
  const values: ProposedContentInput = { ...contentFromForm(formData), audience: String(formData.get("audience") ?? "") };
  const result = await editProposedContent(actor, workspaceId, approvalId, values);
  if (!result.ok) return { message: result.error.message, fieldErrors: result.error.fieldErrors, values };
  redirect(`/w/${workspaceSlug}/approvals/${result.value.id}`);
}
