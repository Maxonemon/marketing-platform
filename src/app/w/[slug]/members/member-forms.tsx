"use client";

import { useActionState } from "react";
import type { WorkspaceRole } from "@/generated/prisma/client";
import { EMAIL_MAX_LENGTH } from "@/lib/limits";
import { Field, INPUT_CLASS } from "../form-field";
import type { MemberFormAction, MemberFormState } from "./actions";
import { ROLE_LABELS } from "./role-display";

const INITIAL_STATE: MemberFormState = {};

const BUTTON_CLASS = "self-start rounded border border-zinc-500/60 px-3 py-1.5 disabled:opacity-50";

const ROLES = Object.keys(ROLE_LABELS) as WorkspaceRole[];

interface MemberFormProps {
  action: MemberFormAction;
}

// Shown only to Owners and Admins; the server refuses anyone else whatever the page shows.
export function InviteForm({ action }: MemberFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Field label="Email" errors={state.fieldErrors?.email}>
        <input
          name="email"
          type="email"
          required
          maxLength={EMAIL_MAX_LENGTH}
          defaultValue={state.email ?? ""}
          className={INPUT_CLASS}
        />
      </Field>
      <Field label="Role" errors={state.fieldErrors?.role}>
        <select name="role" defaultValue="MEMBER" className={INPUT_CLASS}>
          <option value="MEMBER">{ROLE_LABELS.MEMBER}: drafts and edits content</option>
          <option value="ADMIN">{ROLE_LABELS.ADMIN}: also approves and invites</option>
        </select>
      </Field>
      {state.message && !state.fieldErrors && <p role="alert" className="text-sm text-red-600">{state.message}</p>}
      {state.saved && <p className="text-sm text-zinc-500">Invited. They join the first time they sign in with that email.</p>}
      <button type="submit" disabled={pending} className={BUTTON_CLASS}>
        Invite
      </button>
    </form>
  );
}

interface RoleFormProps extends MemberFormProps {
  role: WorkspaceRole;
}

// Shown only to Owners; the server refuses anyone else, and demoting the last Owner.
export function RoleForm({ action, role }: RoleFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <select name="role" defaultValue={role} aria-label="Role" className={INPUT_CLASS}>
        {ROLES.map((option) => (
          <option key={option} value={option}>
            {ROLE_LABELS[option]}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className={BUTTON_CLASS}>
        Change role
      </button>
      {state.message && <p role="alert" className="text-sm text-red-600">{state.message}</p>}
    </form>
  );
}

// Shown only to Owners; the server refuses anyone else, and removing the last Owner.
export function RemoveForm({ action }: MemberFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <button type="submit" disabled={pending} className={BUTTON_CLASS}>
        Remove
      </button>
      {state.message && <p role="alert" className="text-sm text-red-600">{state.message}</p>}
    </form>
  );
}
