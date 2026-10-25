import { z } from "zod";
import { checkBrandRules, type BrandRules, type RuleViolation } from "@/lib/brand-rules";
import { CONTENT_TYPES_WITH_SUBJECT, type ContentType } from "@/lib/content-options";
import { AUDIENCE_MAX_LENGTH, CONTENT_BODY_MAX_LENGTH, CONTENT_SUBJECT_MAX_LENGTH } from "@/lib/limits";
import { fail, ok, type Result } from "./result";

// The text of a Content Asset: what the content agent writes and a member edits.
export interface Content {
  // Set only for content types that have one (an Email's subject line).
  subject: string | null;
  body: string;
}

// As submitted from a form: a subject is ignored for content types without one.
export interface ContentInput {
  subject?: string;
  body: string;
}

const bodySchema = z
  .string()
  .trim()
  .min(1, "Write the text.")
  .max(CONTENT_BODY_MAX_LENGTH, `Use at most ${CONTENT_BODY_MAX_LENGTH} characters.`);
const subjectSchema = z
  .string()
  .trim()
  .min(1, "Write a subject line.")
  .max(CONTENT_SUBJECT_MAX_LENGTH, `Use at most ${CONTENT_SUBJECT_MAX_LENGTH} characters.`);

// Who a Proposed Action reaches, in the Channel's terms. Blank means none. One line with
// no control characters, so a Channel can't read part of it as a header or a second
// recipient; each real Channel will check its own format too.
export const audienceSchema = z
  .string()
  .trim()
  .max(AUDIENCE_MAX_LENGTH, `Use at most ${AUDIENCE_MAX_LENGTH} characters.`)
  .regex(/^\P{Cc}*$/u, "Use one line, without tabs or control characters.")
  .transform((audience) => (audience === "" ? null : audience));

const contentWithSubjectSchema = z.object({ subject: subjectSchema, body: bodySchema });
const bodyOnlySchema = z.object({ body: bodySchema }).transform(({ body }): Content => ({ subject: null, body }));

export function parseContent(contentType: ContentType, input: ContentInput): Result<Content> {
  const schema = CONTENT_TYPES_WITH_SUBJECT.has(contentType) ? contentWithSubjectSchema : bodyOnlySchema;
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return fail("INVALID_INPUT", "Check the highlighted fields.", z.flattenError(parsed.error).fieldErrors);
  }
  return ok(parsed.data);
}

// A form's subject and body fields. A form without a subject field sends none.
export function contentFromForm(formData: FormData): ContentInput {
  const subject = formData.get("subject");
  return { subject: subject === null ? undefined : String(subject), body: String(formData.get("body") ?? "") };
}

// The subject line is checked with the body.
export function checkContent({ subject, body }: Content, rules: BrandRules): RuleViolation[] {
  return checkBrandRules([subject, body].filter(Boolean).join("\n"), rules);
}
