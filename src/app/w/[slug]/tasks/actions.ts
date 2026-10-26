"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { sendContentRequested } from "@/inngest/client";
import { contentFromForm, type ContentInput } from "@/lib/app/content-edits";
import { requestContent, type ContentRequestInput } from "@/lib/app/content-requests";
import type { FieldErrors } from "@/lib/app/result";
import { discardReview, editVariant, submitReview } from "@/lib/app/reviews";
import { cancelTask } from "@/lib/app/tasks";
import { notifyTeam } from "@/lib/app/notifications";
import { createSlackNotifier } from "@/lib/notifications/slack-notifier";
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

export interface EditVariantFormState {
  message?: string;
  fieldErrors?: FieldErrors;
  // What was typed, sent back on failure so the form keeps it.
  values?: ContentInput;
  // True once the edit is saved.
  saved?: boolean;
}

export type EditVariantFormAction = (previous: EditVariantFormState, formData: FormData) => Promise<EditVariantFormState>;

// Saves an edit to a Variant in an open Review. Bound ids are trusted only as far as
// editVariant checks them (membership, a Task scoped to the Workspace and still
// IN_REVIEW, a Variant of that Task).
export async function editVariantAction(
  workspaceId: string,
  taskId: string,
  contentAssetId: string,
  _previous: EditVariantFormState,
  formData: FormData,
): Promise<EditVariantFormState> {
  const actor = await requireActor();
  const values = contentFromForm(formData);
  const result = await editVariant(actor, workspaceId, taskId, contentAssetId, values);
  if (!result.ok) return { message: result.error.message, fieldErrors: result.error.fieldErrors, values };
  refresh();
  return { saved: true };
}

export interface SubmitReviewFormState {
  message?: string;
  fieldErrors?: FieldErrors;
  // What was typed, sent back on failure so the form keeps it.
  audience?: string;
}

export type SubmitReviewFormAction = (
  previous: SubmitReviewFormState,
  formData: FormData,
) => Promise<SubmitReviewFormState>;

// Submits the picked Variant and opens its new Approval. Bound ids are trusted only as
// far as submitReview checks them (membership, a Task scoped to the Workspace and still
// IN_REVIEW, a Variant of that Task).
export async function submitReviewAction(
  workspaceId: string,
  workspaceSlug: string,
  taskId: string,
  _previous: SubmitReviewFormState,
  formData: FormData,
): Promise<SubmitReviewFormState> {
  const actor = await requireActor();
  const contentAssetId = String(formData.get("contentAssetId") ?? "");
  const audience = String(formData.get("audience") ?? "");
  const result = await submitReview(actor, workspaceId, taskId, { contentAssetId, audience });
  if (!result.ok) return { message: result.error.message, fieldErrors: result.error.fieldErrors, audience };
  await notifyTeam(createSlackNotifier(), { kind: "APPROVAL_PENDING", approvalId: result.value.id });
  redirect(`/w/${workspaceSlug}/approvals/${result.value.id}`);
}

export interface TaskActionFormState {
  message?: string;
}

export type TaskActionFormAction = (previous: TaskActionFormState, formData: FormData) => Promise<TaskActionFormState>;

// Cancels a QUEUED Task. Bound ids are trusted only as far as cancelTask checks them
// (membership, a Task scoped to the Workspace and still QUEUED). The form sends no fields.
export async function cancelTaskAction(workspaceId: string, taskId: string): Promise<TaskActionFormState> {
  const actor = await requireActor();
  const result = await cancelTask(actor, workspaceId, taskId);
  if (!result.ok) return { message: result.error.message };
  refresh();
  return {};
}

// Closes an open Review without submitting. Bound ids are trusted only as far as
// discardReview checks them (membership, a Task scoped to the Workspace and IN_REVIEW).
// The bound slug only shapes the caller's own redirect, which always stays under /w/.
export async function discardReviewAction(workspaceId: string, workspaceSlug: string, taskId: string): Promise<TaskActionFormState> {
  const actor = await requireActor();
  const result = await discardReview(actor, workspaceId, taskId);
  if (!result.ok) return { message: result.error.message };
  redirect(`/w/${workspaceSlug}/tasks/${taskId}`);
}
