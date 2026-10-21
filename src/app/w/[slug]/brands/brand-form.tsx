"use client";

import { useActionState } from "react";
import {
  BRAND_AUDIENCE_MAX_LENGTH,
  BRAND_INDUSTRY_MAX_LENGTH,
  BRAND_NAME_MAX_LENGTH,
  BRAND_VOICE_MAX_LENGTH,
  BRAND_WEBSITE_MAX_LENGTH,
} from "@/lib/limits";
import { Field, INPUT_CLASS } from "../form-field";
import type { BrandFormAction, BrandFormState, BrandFormValues } from "./actions";

const INITIAL_STATE: BrandFormState = {};

interface BrandFormProps {
  action: BrandFormAction;
  initialValues?: BrandFormValues;
  submitLabel: string;
}

// Creates a Brand or edits its settings. React resets the form after each submit; on a
// failed one the state carries what was typed, so the reset keeps the person's edits.
export function BrandForm({ action, initialValues = {}, submitLabel }: BrandFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);
  const values = state.values ?? initialValues;
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Field label="Name" errors={errors.name}>
        <input name="name" required maxLength={BRAND_NAME_MAX_LENGTH} defaultValue={values.name ?? ""} className={INPUT_CLASS} />
      </Field>
      <Field label="Website (optional)" errors={errors.websiteUrl}>
        <input
          name="websiteUrl"
          type="url"
          placeholder="https://acme.com"
          maxLength={BRAND_WEBSITE_MAX_LENGTH}
          defaultValue={values.websiteUrl ?? ""}
          className={INPUT_CLASS}
        />
      </Field>
      <Field label="Industry (optional)" errors={errors.industry}>
        <input name="industry" maxLength={BRAND_INDUSTRY_MAX_LENGTH} defaultValue={values.industry ?? ""} className={INPUT_CLASS} />
      </Field>
      <Field label="Audience (optional): who the content is for" errors={errors.audience}>
        <textarea name="audience" rows={3} maxLength={BRAND_AUDIENCE_MAX_LENGTH} defaultValue={values.audience ?? ""} className={INPUT_CLASS} />
      </Field>
      <Field label="Voice (optional): how the Brand sounds, e.g. warm, plain words, no jargon" errors={errors.voice}>
        <textarea name="voice" rows={4} maxLength={BRAND_VOICE_MAX_LENGTH} defaultValue={values.voice ?? ""} className={INPUT_CLASS} />
      </Field>
      {state.message && !state.fieldErrors && <p role="alert" className="text-sm text-red-600">{state.message}</p>}
      {state.saved && <p role="status" className="text-sm text-green-600">Saved.</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-foreground px-3 py-2 text-background disabled:opacity-50"
      >
        {submitLabel}
      </button>
    </form>
  );
}
