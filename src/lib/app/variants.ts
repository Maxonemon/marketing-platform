import { ruleViolationsSchema, type RuleViolation } from "@/lib/brand-rules";

// A Content Asset as the Review and the Approval show it. Its own module so reviews.ts
// and approvals.ts share it without importing each other's values.
export interface ReviewVariant {
  id: string;
  variant: number;
  // The subject line, for content types that have one.
  subject: string | null;
  body: string;
  // The Brand rules its text broke when it was written: warnings, never a block.
  violations: RuleViolation[];
}

// What to select of a Content Asset to show it, with toReviewVariant.
export const reviewVariantSelect = { id: true, variant: true, subject: true, body: true, ruleViolations: true } as const;

type ContentAssetRow = Omit<ReviewVariant, "violations"> & { ruleViolations: unknown };

export function toReviewVariant({ ruleViolations, ...variant }: ContentAssetRow): ReviewVariant {
  return { ...variant, violations: ruleViolationsSchema.parse(ruleViolations) };
}
