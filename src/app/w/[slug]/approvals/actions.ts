"use server";

import { refresh } from "next/cache";
import { sendApprovalApproved } from "@/inngest/client";
import { approve } from "@/lib/app/approvals";
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
