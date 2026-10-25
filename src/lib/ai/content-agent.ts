import { z } from "zod";
import type { Brand } from "@/generated/prisma/client";
import { CONTENT_TYPE_LABELS, CONTENT_TYPES_WITH_SUBJECT, type ContentType } from "@/lib/content-options";
import { CONTENT_BODY_MAX_LENGTH, CONTENT_SUBJECT_MAX_LENGTH } from "@/lib/limits";
import type { AiProvider, AiUsage } from "./provider";

// Three real alternatives to choose from in the Review.
export const VARIANT_COUNT = 3;
// Caps the model's answer, and with it what one request can cost. Room for three
// Variants of the longest content type (an Email).
export const CONTENT_AGENT_MAX_TOKENS = 3000;

const bodySchema = z.string().trim().min(1).max(CONTENT_BODY_MAX_LENGTH);
const subjectSchema = z.string().trim().min(1).max(CONTENT_SUBJECT_MAX_LENGTH);

function outputSchemaFor(contentType: ContentType) {
  const variant = CONTENT_TYPES_WITH_SUBJECT.has(contentType)
    ? z.object({ subject: subjectSchema, body: bodySchema })
    : z.object({ body: bodySchema });
  return z.object({ variants: z.array(variant).length(VARIANT_COUNT) });
}

export interface Variant {
  subject?: string;
  body: string;
}

export interface WrittenVariants {
  variants: Variant[];
  usage: AiUsage;
}

export type BrandProfile = Pick<Brand, "name" | "websiteUrl" | "industry" | "audience" | "voice" | "offers" | "keywords">;

export interface ContentBrief {
  contentType: ContentType;
  brief: string;
}

const SYSTEM_PROMPT = [
  "You write marketing content for one brand.",
  "Write in the brand's voice, for its audience, and follow the brief.",
  "Make each variant ready to publish as is: no notes, placeholders or commentary.",
  "Make the variants real alternatives, each with its own angle.",
  'Answer with JSON only: {"variants": [...]}.',
].join(" ");

// The content agent: a plain function. Brand settings and the brief go in, validated
// Variants come out. It never touches the database; its only outside call is the AI provider.
export async function writeVariants(ai: AiProvider, brand: BrandProfile, brief: ContentBrief): Promise<WrittenVariants> {
  const { output, usage } = await ai.generate({
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(brand, brief),
    schema: outputSchemaFor(brief.contentType),
    maxTokens: CONTENT_AGENT_MAX_TOKENS,
  });
  return { variants: output.variants, usage };
}

function buildPrompt(brand: BrandProfile, { contentType, brief }: ContentBrief): string {
  const variantShape = CONTENT_TYPES_WITH_SUBJECT.has(contentType)
    ? '{"subject": "<subject line>", "body": "<text>"}'
    : '{"body": "<text>"}';
  const lines = [
    `Brand: ${brand.name}`,
    brand.websiteUrl && `Website: ${brand.websiteUrl}`,
    brand.industry && `Industry: ${brand.industry}`,
    brand.audience && `Audience: ${brand.audience}`,
    brand.voice && `Voice: ${brand.voice}`,
    brand.offers.length > 0 && `Offers: ${brand.offers.join("; ")}`,
    brand.keywords.length > 0 && `Keywords to use: ${brand.keywords.join("; ")}`,
    `Content type: ${CONTENT_TYPE_LABELS[contentType]}`,
    `Brief: ${brief}`,
    `Write exactly ${VARIANT_COUNT} variants. Each variant is ${variantShape}.`,
  ];
  return lines.filter(Boolean).join("\n");
}
