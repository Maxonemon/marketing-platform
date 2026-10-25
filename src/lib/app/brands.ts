import { z } from "zod";
import type { Brand } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  BRAND_AUDIENCE_MAX_LENGTH,
  BRAND_INDUSTRY_MAX_LENGTH,
  BRAND_LIST_ITEM_MAX_LENGTH,
  BRAND_LIST_MAX_ITEMS,
  BRAND_NAME_MAX_LENGTH,
  BRAND_VOICE_MAX_LENGTH,
  BRAND_WEBSITE_MAX_LENGTH,
} from "@/lib/limits";
import { requireRole, type Actor } from "@/lib/permissions";
import { appendActivity, type BrandFieldChange } from "./activity-log";
import { BRAND_FIELDS, type BrandField } from "./brand-fields";
import { fail, ok, type Result } from "./result";

export type { Brand };

const tooLong = (maxLength: number): string => `Use at most ${maxLength} characters.`;

// Optional text: surrounding spaces are dropped and a blank value is stored as null.
function optionalText(maxLength: number) {
  return z
    .string()
    .trim()
    .max(maxLength, tooLong(maxLength))
    .optional()
    .transform((value) => value || null);
}

// A list of short entries: each is trimmed, blanks are dropped, and an entry that repeats
// an earlier one (ignoring case) is dropped too, since the rule checks ignore case.
const listSchema = z
  .array(z.string().trim().max(BRAND_LIST_ITEM_MAX_LENGTH, `Keep each entry to at most ${BRAND_LIST_ITEM_MAX_LENGTH} characters.`))
  .optional()
  .transform((entries = []) => withoutRepeats(entries.filter(Boolean)))
  .refine((entries) => entries.length <= BRAND_LIST_MAX_ITEMS, `Use at most ${BRAND_LIST_MAX_ITEMS} entries.`);

function withoutRepeats(entries: string[]): string[] {
  return entries.filter(
    (entry, index) => entries.findIndex((other) => other.toLowerCase() === entry.toLowerCase()) === index,
  );
}

// http(s) on a real domain only: the website is rendered as a link, so a javascript:
// address must never get through.
const webAddressSchema = z.httpUrl();
const WEBSITE_INVALID = "Enter a full web address, e.g. https://acme.com.";

const brandSettingsSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(BRAND_NAME_MAX_LENGTH, tooLong(BRAND_NAME_MAX_LENGTH)),
  websiteUrl: optionalText(BRAND_WEBSITE_MAX_LENGTH).refine(
    (value) => value === null || webAddressSchema.safeParse(value).success,
    WEBSITE_INVALID,
  ),
  industry: optionalText(BRAND_INDUSTRY_MAX_LENGTH),
  audience: optionalText(BRAND_AUDIENCE_MAX_LENGTH),
  voice: optionalText(BRAND_VOICE_MAX_LENGTH),
  offers: listSchema,
  keywords: listSchema,
  prohibitedPhrases: listSchema,
  requiredDisclaimers: listSchema,
} satisfies Record<BrandField, z.ZodType>);

export type BrandSettingsInput = z.input<typeof brandSettingsSchema>;
type BrandSettings = z.output<typeof brandSettingsSchema>;

const BRAND_NOT_FOUND = "Brand not found.";

function parseSettings(input: BrandSettingsInput): Result<BrandSettings> {
  const parsed = brandSettingsSchema.safeParse(input);
  if (parsed.success) return ok(parsed.data);
  return fail("INVALID_INPUT", "Check the highlighted fields.", z.flattenError(parsed.error).fieldErrors);
}

// Creates the Brand and its BRAND_CREATED Activity Log entry in one transaction.
export async function createBrand(actor: Actor, workspaceId: string, input: BrandSettingsInput): Promise<Result<Brand>> {
  const access = await requireRole(actor, workspaceId, "MEMBER");
  if (!access.ok) return access;
  const settings = parseSettings(input);
  if (!settings.ok) return settings;
  const brand = await db.$transaction(async (tx) => {
    const created = await tx.brand.create({ data: { workspaceId, ...settings.value } });
    await appendActivity(tx, {
      workspaceId,
      actor,
      brandId: created.id,
      event: "BRAND_CREATED",
      details: { name: created.name },
    });
    return created;
  });
  return ok(brand);
}

export async function listBrands(actor: Actor, workspaceId: string): Promise<Result<Brand[]>> {
  const access = await requireRole(actor, workspaceId, "MEMBER");
  if (!access.ok) return access;
  return ok(await db.brand.findMany({ where: { workspaceId }, orderBy: { name: "asc" } }));
}

// Scoped by workspaceId, so another Workspace's Brand looks exactly like a missing one.
export async function getBrand(actor: Actor, workspaceId: string, brandId: string): Promise<Result<Brand>> {
  const access = await requireRole(actor, workspaceId, "MEMBER");
  if (!access.ok) return access;
  const brand = await db.brand.findFirst({ where: { id: brandId, workspaceId } });
  return brand ? ok(brand) : fail("NOT_FOUND", BRAND_NOT_FOUND);
}

// Replaces all settings. Logs a BRAND_UPDATED entry with each changed field's old and
// new value, in the same transaction; saving unchanged settings writes and logs nothing.
// Two saves at the same moment can both read the same old values; accepted for now.
export async function updateBrand(
  actor: Actor,
  workspaceId: string,
  brandId: string,
  input: BrandSettingsInput,
): Promise<Result<Brand>> {
  const access = await requireRole(actor, workspaceId, "MEMBER");
  if (!access.ok) return access;
  const settings = parseSettings(input);
  if (!settings.ok) return settings;
  return db.$transaction(async (tx) => {
    const before = await tx.brand.findFirst({ where: { id: brandId, workspaceId } });
    if (!before) return fail("NOT_FOUND", BRAND_NOT_FOUND);
    const changes = changesBetween(before, settings.value);
    if (changes.length === 0) return ok(before);
    const brand = await tx.brand.update({ where: { id: brandId }, data: settings.value });
    await appendActivity(tx, { workspaceId, actor, brandId, event: "BRAND_UPDATED", details: { changes } });
    return ok(brand);
  });
}

function changesBetween(before: BrandSettings, after: BrandSettings): BrandFieldChange[] {
  return BRAND_FIELDS.filter((field) => !isSameSetting(before[field], after[field])).map((field) => ({
    field,
    from: before[field],
    to: after[field],
  }));
}

type SettingValue = BrandSettings[BrandField];

// Lists are the same when they hold the same entries in the same order.
function isSameSetting(before: SettingValue, after: SettingValue): boolean {
  if (Array.isArray(before) && Array.isArray(after)) {
    return before.length === after.length && before.every((entry, index) => entry === after[index]);
  }
  return before === after;
}
