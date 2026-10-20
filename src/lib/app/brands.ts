import { z } from "zod";
import type { Brand } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  BRAND_AUDIENCE_MAX_LENGTH,
  BRAND_INDUSTRY_MAX_LENGTH,
  BRAND_NAME_MAX_LENGTH,
  BRAND_VOICE_MAX_LENGTH,
  BRAND_WEBSITE_MAX_LENGTH,
} from "@/lib/limits";
import { requireRole, type Actor } from "@/lib/permissions";
import { appendActivity } from "./activity-log";
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
});

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
