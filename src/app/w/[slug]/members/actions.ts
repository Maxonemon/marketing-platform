"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { changeRole, inviteMember, removeMember } from "@/lib/app/members";
import type { FieldErrors } from "@/lib/app/result";
import { requireActor } from "@/lib/session";

export interface MemberFormState {
  message?: string;
  fieldErrors?: FieldErrors;
  // What was typed, sent back on failure so the invite form keeps it.
  email?: string;
  saved?: boolean;
}

export type MemberFormAction = (previous: MemberFormState, formData: FormData) => Promise<MemberFormState>;

// Thin: parse the form, call one application-layer operation, map the result. The bound
// ids come back from the browser, so they are only trusted as far as those operations
// check them (an Owner or Admin of the Workspace for inviting, an Owner for the rest,
// and a member looked up in that Workspace).
export async function inviteAction(workspaceId: string, _previous: MemberFormState, formData: FormData): Promise<MemberFormState> {
  const actor = await requireActor();
  const email = String(formData.get("email") ?? "");
  const result = await inviteMember(actor, workspaceId, { email, role: String(formData.get("role") ?? "") });
  if (!result.ok) return { message: result.error.message, fieldErrors: result.error.fieldErrors, email };
  refresh();
  return { saved: true };
}

export async function changeRoleAction(
  workspaceId: string,
  memberUserId: string,
  _previous: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const actor = await requireActor();
  const result = await changeRole(actor, workspaceId, memberUserId, { role: String(formData.get("role") ?? "") });
  if (!result.ok) return { message: result.error.message };
  refresh();
  return { saved: true };
}

// An Owner who removes themselves has no access left, so they go back to the start page.
// The form sends no fields, so the form state and data are not read.
export async function removeMemberAction(workspaceId: string, memberUserId: string): Promise<MemberFormState> {
  const actor = await requireActor();
  const result = await removeMember(actor, workspaceId, memberUserId);
  if (!result.ok) return { message: result.error.message };
  if (memberUserId === actor.userId) redirect("/");
  refresh();
  return {};
}
