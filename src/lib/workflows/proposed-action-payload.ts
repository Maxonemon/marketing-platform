import { createHash } from "node:crypto";
import { z } from "zod";
import { CHANNELS, CONTENT_TYPES } from "@/lib/content-options";

// Exactly what a Proposed Action would publish or send. Any change to any field is a
// material change: it needs a new Proposed Action and a fresh Approval. Strict, so a
// stored payload with an unknown field fails to parse instead of being sent without it.
export const proposedActionPayloadSchema = z.strictObject({
  channel: z.enum(CHANNELS),
  contentType: z.enum(CONTENT_TYPES),
  // `subject` only for content types that have one (an Email). Optional, so payloads
  // stored before it existed keep parsing and keep their hashes.
  content: z.strictObject({ subject: z.string().min(1).optional(), body: z.string().min(1) }),
  // Who it reaches, in the Channel's terms, as set at submit or in an edit; null for none.
  audience: z.string().nullable(),
  // Always "as soon as approved" for now. Kept in the payload so that scheduling a
  // future time later is a material change too.
  timing: z.strictObject({ kind: z.literal("AS_SOON_AS_APPROVED") }),
});

export type ProposedActionPayload = z.infer<typeof proposedActionPayloadSchema>;

// Deterministic JSON: object keys sorted at every level, no whitespace, undefined
// fields left out. Equal payloads always serialize to the same text.
export function canonicalizePayload(payload: ProposedActionPayload): string {
  return canonicalJson(payload);
}

// SHA-256 (hex) of the canonical serialization. Stored with the Proposed Action and
// recomputed by the execution service just before anything is sent.
export function hashPayload(payload: ProposedActionPayload): string {
  return createHash("sha256").update(canonicalizePayload(payload), "utf8").digest("hex");
}

// A stored payload, re-validated and hash-checked: null when it doesn't parse (e.g. a
// field was added) or its canonical hash differs from the stored one. Use the returned
// payload, never the raw stored JSON.
export function verifyPayload(stored: unknown, storedHash: string): ProposedActionPayload | null {
  const parsed = proposedActionPayloadSchema.safeParse(stored);
  if (!parsed.success) return null;
  return hashPayload(parsed.data) === storedHash ? parsed.data : null;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  const fields = Object.entries(value)
    .filter(([, field]) => field !== undefined)
    // Compares UTF-16 code units, so the order never depends on a locale.
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, field]) => `${JSON.stringify(key)}:${canonicalJson(field)}`);
  return `{${fields.join(",")}}`;
}
