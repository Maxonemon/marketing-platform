"use client";

import { useActionState } from "react";
import { CHANNEL_LABELS, CHANNELS, CONTENT_TYPE_LABELS, CONTENT_TYPES } from "@/lib/content-options";
import { CONTENT_BRIEF_MAX_LENGTH } from "@/lib/limits";
import { Field, INPUT_CLASS } from "../form-field";
import type { RequestContentFormAction, RequestContentFormState } from "./actions";

const INITIAL_STATE: RequestContentFormState = {};

interface RequestContentFormProps {
  action: RequestContentFormAction;
}

// Asks the content agent for content for one Brand. On success the action redirects to
// the new Task; on failure the state carries what was typed, so nothing is lost.
export function RequestContentForm({ action }: RequestContentFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);
  const values = state.values ?? {};
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Field label="Content type" errors={errors.contentType}>
        <select name="contentType" defaultValue={values.contentType ?? CONTENT_TYPES[0]} className={INPUT_CLASS}>
          {CONTENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {CONTENT_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Channel: where it would be published" errors={errors.channel}>
        <select name="channel" defaultValue={values.channel ?? CHANNELS[0]} className={INPUT_CLASS}>
          {CHANNELS.map((channel) => (
            <option key={channel} value={channel}>
              {CHANNEL_LABELS[channel]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Brief: what to write about" errors={errors.brief}>
        <textarea
          name="brief"
          required
          rows={3}
          maxLength={CONTENT_BRIEF_MAX_LENGTH}
          defaultValue={values.brief ?? ""}
          className={INPUT_CLASS}
        />
      </Field>
      {state.message && !state.fieldErrors && <p role="alert" className="text-sm text-red-600">{state.message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-foreground px-3 py-2 text-background disabled:opacity-50"
      >
        Request content
      </button>
    </form>
  );
}
