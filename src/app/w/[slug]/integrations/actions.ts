"use server";

import { refresh } from "next/cache";
import { connectSlack, removeSlack, sendSlackTestMessage } from "@/lib/app/integrations";
import type { FieldErrors } from "@/lib/app/result";
import { createSlackNotifier } from "@/lib/notifications/slack-notifier";
import { requireActor } from "@/lib/session";

// The webhook URL is never sent back, not even what was typed: a failed form starts empty.
export interface IntegrationFormState {
  message?: string;
  fieldErrors?: FieldErrors;
  saved?: boolean;
}

export type IntegrationFormAction = (previous: IntegrationFormState, formData: FormData) => Promise<IntegrationFormState>;

// Thin: parse the form, call one application-layer operation, map the result. The bound
// Workspace id comes back from the browser, so it is only trusted as far as those
// operations check it (an Owner or Admin of that Workspace).
export async function connectSlackAction(
  workspaceId: string,
  _previous: IntegrationFormState,
  formData: FormData,
): Promise<IntegrationFormState> {
  const actor = await requireActor();
  const result = await connectSlack(actor, workspaceId, { webhookUrl: String(formData.get("webhookUrl") ?? "") });
  if (!result.ok) return { message: result.error.message, fieldErrors: result.error.fieldErrors };
  refresh();
  return { saved: true };
}

// The form sends no fields, so the form state and data are not read.
export async function removeSlackAction(workspaceId: string): Promise<IntegrationFormState> {
  const actor = await requireActor();
  const result = await removeSlack(actor, workspaceId);
  if (!result.ok) return { message: result.error.message };
  refresh();
  return {};
}

// A failed test message is reported in the form, with the Notifier's safe message.
export async function testSlackAction(workspaceId: string): Promise<IntegrationFormState> {
  const actor = await requireActor();
  const result = await sendSlackTestMessage(actor, workspaceId, createSlackNotifier());
  if (!result.ok) return { message: result.error.message };
  if (!result.value.delivered) return { message: `The test message failed: ${result.value.error}` };
  return { saved: true };
}
