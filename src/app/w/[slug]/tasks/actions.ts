"use server";

import { redirect } from "next/navigation";
import { sendContentRequested } from "@/inngest/client";
import { requestContent, type ContentRequestInput } from "@/lib/app/content-requests";
import type { FieldErrors } from "@/lib/app/result";
import { requireActor } from "@/lib/session";

export interface RequestContentFormState {
  message?: string;
  fieldErrors?: FieldErrors;
  // What was submitted, sent back on failure so the form keeps the person's input.
  values?: Partial<ContentRequestInput>;
}

export type RequestContentFormAction = (
  previous: RequestContentFormState,
  formData: FormData,
) => Promise<RequestContentFormState>;

// Thin: parse the form, call one application-layer operation, map the result. The bound
// ids come back from the browser, so they are only trusted as far as requestContent
// checks them (membership, and a Brand lookup scoped to the Workspace). The bound slug
// only shapes the caller's own redirect, which always stays under /w/ on this site.
export async function requestContentAction(
  workspaceId: string,
  workspaceSlug: string,
  brandId: string,
  _previous: RequestContentFormState,
  formData: FormData,
): Promise<RequestContentFormState> {
  const actor = await requireActor();
  const text = (field: keyof ContentRequestInput): string => String(formData.get(field) ?? "");
  const values: ContentRequestInput = { contentType: text("contentType"), channel: text("channel"), brief: text("brief") };
  const result = await requestContent(actor, workspaceId, brandId, values, sendContentRequested);
  if (!result.ok) return { message: result.error.message, fieldErrors: result.error.fieldErrors, values };
  redirect(`/w/${workspaceSlug}/tasks/${result.value.id}`);
}
