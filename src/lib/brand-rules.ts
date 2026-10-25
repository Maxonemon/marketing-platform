import { z } from "zod";

// The Brand rule checker: text and a Brand's rules in, violations out. Violations are
// warnings for the Review and the Approver; they never block a submission. No server
// imports, so pages can use the types.

export interface BrandRules {
  prohibitedPhrases: readonly string[];
  requiredDisclaimers: readonly string[];
}

// Also parses the violations stored with each Content Asset.
export const ruleViolationsSchema = z.array(
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("PROHIBITED_PHRASE"), phrase: z.string() }),
    z.object({ kind: z.literal("MISSING_DISCLAIMER"), disclaimer: z.string() }),
  ]),
);

export type RuleViolation = z.infer<typeof ruleViolationsSchema>[number];

// Case-insensitive, and any run of whitespace counts as one space. A prohibited phrase
// matches whole words only, so "free" flags "Free shipping" but not "freedom". Each
// broken rule is reported once, prohibited phrases first, in the order of the rules.
export function checkBrandRules(text: string, rules: BrandRules): RuleViolation[] {
  const normalized = normalize(text);
  const prohibited = rules.prohibitedPhrases
    .filter((phrase) => containsWholeWords(normalized, normalize(phrase)))
    .map((phrase): RuleViolation => ({ kind: "PROHIBITED_PHRASE", phrase }));
  const missing = rules.requiredDisclaimers
    .filter((disclaimer) => !normalized.includes(normalize(disclaimer)))
    .map((disclaimer): RuleViolation => ({ kind: "MISSING_DISCLAIMER", disclaimer }));
  return [...prohibited, ...missing];
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

const WORD_CHARACTER = /[\p{L}\p{N}]/u;

// A word boundary is only required where the phrase itself starts or ends with a letter
// or digit: "#ad" or "100%" can't sit inside a longer word anyway.
function containsWholeWords(text: string, phrase: string): boolean {
  if (phrase === "") return false;
  const start = WORD_CHARACTER.test(phrase.at(0) ?? "") ? "(?<![\\p{L}\\p{N}])" : "";
  const end = WORD_CHARACTER.test(phrase.at(-1) ?? "") ? "(?![\\p{L}\\p{N}])" : "";
  return new RegExp(`${start}${escapeRegExp(phrase)}${end}`, "u").test(text);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
