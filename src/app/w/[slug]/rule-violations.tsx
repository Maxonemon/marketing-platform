import type { RuleViolation } from "@/lib/brand-rules";

interface RuleViolationsProps {
  violations: RuleViolation[];
}

// The Brand rules a Variant breaks, as warnings: they never block a submission, and the
// Approver decides.
export function RuleViolations({ violations }: RuleViolationsProps) {
  if (violations.length === 0) return <p className="text-sm text-muted">Follows the Brand rules.</p>;
  return (
    <div className="flex flex-col gap-1 rounded-md border border-warning/30 bg-warning-soft text-warning p-2 text-sm">
      <p className="font-medium">Brand rule warnings</p>
      <ul className="list-disc pl-5">
        {violations.map((violation) => (
          <li key={violationKey(violation)} className="wrap-break-word">
            {violation.kind === "PROHIBITED_PHRASE" ? (
              <>
                Uses the prohibited phrase <q>{violation.phrase}</q>
              </>
            ) : (
              <>
                Missing the required disclaimer <q>{violation.disclaimer}</q>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function violationKey(violation: RuleViolation): string {
  return violation.kind === "PROHIBITED_PHRASE" ? `phrase:${violation.phrase}` : `disclaimer:${violation.disclaimer}`;
}
