import { z } from "zod";
import type { Brand } from "@/generated/prisma/client";
import { CONTENT_TYPE_LABELS, type ContentType } from "@/lib/content-options";
import type { AiProvider } from "./provider";

// One Variant per request for now; ticket 06 asks for three.
export const VARIANT_COUNT = 1;
// Caps the model's answer, and with it what one request can cost.
export const CONTENT_AGENT_MAX_TOKENS = 1024;
const VARIANT_BODY_MAX_LENGTH = 5000;

const variantSchema = z.object({ body: z.string().trim().min(1).max(VARIANT_BODY_MAX_LENGTH) });
const contentAgentOutputSchema = z.object({ variants: z.array(variantSchema).length(VARIANT_COUNT) });

export type Variant = z.infer<typeof variantSchema>;
export type BrandProfile = Pick<Brand, "name" | "websiteUrl" | "industry" | "audience" | "voice">;

export interface ContentBrief {
  contentType: ContentType;
  brief: string;
}

const SYSTEM_PROMPT = [
  "You write marketing content for one brand.",
  "Write in the brand's voice, for its audience, and follow the brief.",
  "Make each variant ready to publish as is: no notes, placeholders or commentary.",
].join(" ");

// The content agent: a plain function. Brand settings and the brief go in, validated
// Variants come out. It never touches the database; its only outside call is the AI provider.
export async function writeVariants(ai: AiProvider, brand: BrandProfile, brief: ContentBrief): Promise<Variant[]> {
  const { output } = await ai.generate({
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(brand, brief),
    schema: contentAgentOutputSchema,
    maxTokens: CONTENT_AGENT_MAX_TOKENS,
  });
  return output.variants;
}

function buildPrompt(brand: BrandProfile, { contentType, brief }: ContentBrief): string {
  const lines = [
    `Brand: ${brand.name}`,
    brand.websiteUrl && `Website: ${brand.websiteUrl}`,
    brand.industry && `Industry: ${brand.industry}`,
    brand.audience && `Audience: ${brand.audience}`,
    brand.voice && `Voice: ${brand.voice}`,
    `Content type: ${CONTENT_TYPE_LABELS[contentType]}`,
    `Brief: ${brief}`,
    `Write ${VARIANT_COUNT} variant(s).`,
  ];
  return lines.filter(Boolean).join("\n");
}
