"use client";

import { useActionState } from "react";
import { SLACK_WEBHOOK_URL_MAX_LENGTH } from "@/lib/limits";
import { Field, INPUT_CLASS } from "../form-field";
import type { IntegrationFormAction, IntegrationFormState } from "./actions";

const INITIAL_STATE: IntegrationFormState = {};

const BUTTON_CLASS = "self-start rounded border border-zinc-500/60 px-3 py-1.5 disabled:opacity-50";

interface IntegrationFormProps {
  action: IntegrationFormAction;
}

interface ConnectSlackFormProps extends IntegrationFormProps {
  connected: boolean;
}

// Shown only to Owners and Admins; the server refuses anyone else whatever the page shows.
// A password field, so the pasted URL isn't left on screen.
export function ConnectSlackForm({ action, connected }: ConnectSlackFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Field label={connected ? "New incoming webhook URL" : "Incoming webhook URL"} errors={state.fieldErrors?.webhookUrl}>
        <input
          name="webhookUrl"
          type="password"
          required
          autoComplete="off"
          maxLength={SLACK_WEBHOOK_URL_MAX_LENGTH}
          placeholder="https://hooks.slack.com/services/…"
          className={INPUT_CLASS}
        />
      </Field>
      {state.message && !state.fieldErrors && <p role="alert" className="text-sm text-red-600">{state.message}</p>}
      {state.saved && <p className="text-sm text-zinc-500">Saved. Send a test message to check it.</p>}
      <button type="submit" disabled={pending} className={BUTTON_CLASS}>
        {connected ? "Replace webhook URL" : "Connect Slack"}
      </button>
    </form>
  );
}

export function TestSlackForm({ action }: IntegrationFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <button type="submit" disabled={pending} className={BUTTON_CLASS}>
        Send a test message
      </button>
      {state.message && <p role="alert" className="text-sm text-red-600">{state.message}</p>}
      {state.saved && <p className="text-sm text-zinc-500">Sent. Check the Slack channel.</p>}
    </form>
  );
}

export function RemoveSlackForm({ action }: IntegrationFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <button type="submit" disabled={pending} className={BUTTON_CLASS}>
        Remove Slack
      </button>
      {state.message && <p role="alert" className="text-sm text-red-600">{state.message}</p>}
    </form>
  );
}
