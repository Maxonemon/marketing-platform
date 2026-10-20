"use server";

import { redirect } from "next/navigation";
import type { FieldErrors } from "@/lib/app/result";
import { createWorkspace } from "@/lib/app/workspaces";
import { requireActor } from "@/lib/session";

export interface CreateWorkspaceFormState {
  message?: string;
  fieldErrors?: FieldErrors;
}

// Thin: parse the form, call the application-layer operation, map the result.
export async function createWorkspaceAction(
  _previous: CreateWorkspaceFormState,
  formData: FormData,
): Promise<CreateWorkspaceFormState> {
  const actor = await requireActor();
  const result = await createWorkspace(actor, {
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
  });
  if (!result.ok) return { message: result.error.message, fieldErrors: result.error.fieldErrors };
  redirect(`/w/${result.value.slug}`);
}
