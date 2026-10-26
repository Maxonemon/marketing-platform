"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { sendApprovalApproved } from "@/inngest/client";
import { approve, reject, resubmit } from "@/lib/app/approvals";
import type { FieldErrors } from "@/lib/app/result";
import { notifyTeam } from "@/lib/app/notifications";
import { createSlackNotifier } from "@/lib/notifications/slack-notifier";
import { requireActor } from "@/lib/session";

export interface ApproveFormState {
  message?: string;
}

export type ApproveFormAction = (previous: ApproveFormState, formData: FormData) => Promise<ApproveFormState>;

// Thin: call one application-layer operation and map the result. The bound ids come
// back from the browser, so they are only trusted as far as approve checks them (an
// Owner or Admin of the Workspace, an Approval scoped to it and still PENDING). The form
// sends no fields, so the form state and data are not read.
export async function approveAction(workspaceId: string, approvalId: string): Promise<ApproveFormState> {
  const actor = await requireActor();
  const result = await approve(actor, workspaceId, approvalId, sendApprovalApproved);
  if (!result.ok) return { message: result.error.message };
  refresh();
  return {};
}

export interface RejectFormState {
  message?: string;
  fieldErrors?: FieldErrors;
  // What was typed, sent back on failure so the form keeps it.
  comment?: string;
}

export type RejectFormAction = (previous: RejectFormState, formData: FormData) => Promise<RejectFormState>;

// Bound ids are trusted only as far as reject checks them (an Owner or Admin of the
// Workspace, an Approval scoped to it and still PENDING).
export async function rejectAction(
  workspaceId: string,
  approvalId: string,
  _previous: RejectFormState,
  formData: FormData,
): Promise<RejectFormState> {
  const actor = await requireActor();
  const comment = String(formData.get("comment") ?? "");
  const result = await reject(actor, workspaceId, approvalId, { comment });
  if (!result.ok) return { message: result.error.message, fieldErrors: result.error.fieldErrors, comment };
  refresh();
  return {};
}

export interface ResubmitFormState {
  message?: string;
}

export type ResubmitFormAction = (previous: ResubmitFormState, formData: FormData) => Promise<ResubmitFormState>;

// Resubmits a Rejected Approval and opens the new one. Bound ids are trusted only as far
// as resubmit checks them (membership, an Approval scoped to the Workspace and REJECTED).
// The bound slug only shapes the caller's own redirect, which always stays under /w/.
export async function resubmitAction(workspaceId: string, workspaceSlug: string, approvalId: string): Promise<ResubmitFormState> {
  const actor = await requireActor();
  const result = await resubmit(actor, workspaceId, approvalId);
  if (!result.ok) return { message: result.error.message };
  await notifyTeam(createSlackNotifier(), { kind: "APPROVAL_PENDING", approvalId: result.value.id });
  redirect(`/w/${workspaceSlug}/approvals/${result.value.id}`);
}
