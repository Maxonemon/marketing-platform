"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { BrandField } from "@/lib/app/brand-fields";
import { createBrand, updateBrand, type BrandSettingsInput } from "@/lib/app/brands";
import type { AppError, FieldErrors } from "@/lib/app/result";
import { requireActor } from "@/lib/session";

// As typed in the form: a list setting is one entry per line.
export type BrandFormValues = { [Field in BrandField]?: string | null };

export interface BrandFormState {
  message?: string;
  fieldErrors?: FieldErrors;
  // What was submitted, sent back on failure so the form keeps the person's edits.
  values?: BrandFormValues;
  saved?: boolean;
}

export type BrandFormAction = (previous: BrandFormState, formData: FormData) => Promise<BrandFormState>;

// Thin: parse the form, call one application-layer operation, map the result. The bound
// ids come back from the browser, so they are only trusted as far as those operations
// check them (membership, and Brand lookups scoped to the Workspace). The bound slug only
// shapes the caller's own redirect, which always stays under /w/ on this site.
export async function createBrandAction(
  workspaceId: string,
  workspaceSlug: string,
  _previous: BrandFormState,
  formData: FormData,
): Promise<BrandFormState> {
  const actor = await requireActor();
  const values = readForm(formData);
  const result = await createBrand(actor, workspaceId, toSettings(values));
  if (!result.ok) return failedState(result.error, values);
  redirect(`/w/${workspaceSlug}/brands/${result.value.id}`);
}

export async function updateBrandAction(
  workspaceId: string,
  brandId: string,
  _previous: BrandFormState,
  formData: FormData,
): Promise<BrandFormState> {
  const actor = await requireActor();
  const values = readForm(formData);
  const result = await updateBrand(actor, workspaceId, brandId, toSettings(values));
  if (!result.ok) return failedState(result.error, values);
  refresh();
  return { saved: true };
}

function readForm(formData: FormData): Record<BrandField, string> {
  const text = (field: BrandField): string => String(formData.get(field) ?? "");
  return {
    name: text("name"),
    websiteUrl: text("websiteUrl"),
    industry: text("industry"),
    audience: text("audience"),
    voice: text("voice"),
    offers: text("offers"),
    keywords: text("keywords"),
    prohibitedPhrases: text("prohibitedPhrases"),
    requiredDisclaimers: text("requiredDisclaimers"),
  };
}

// Blank lines and surrounding spaces are dropped by the settings schema.
function toSettings(form: ReturnType<typeof readForm>): Required<BrandSettingsInput> {
  const { offers, keywords, prohibitedPhrases, requiredDisclaimers, ...text } = form;
  const lines = (value: string): string[] => value.split(/\r?\n/);
  return {
    ...text,
    offers: lines(offers),
    keywords: lines(keywords),
    prohibitedPhrases: lines(prohibitedPhrases),
    requiredDisclaimers: lines(requiredDisclaimers),
  };
}

function failedState(error: AppError, values: BrandFormValues): BrandFormState {
  return { message: error.message, fieldErrors: error.fieldErrors, values };
}
