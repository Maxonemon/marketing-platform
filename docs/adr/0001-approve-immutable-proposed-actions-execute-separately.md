# Approve immutable Proposed Actions; record Execution separately

A human approves a **Proposed Action**, an immutable snapshot of content, Channel, audience and timing, and never an editable Content Asset. Any material change creates a new Proposed Action and marks the old Approval **Superseded**, so approving one version can never approve a later edit. An **Approval** records only the human decision. Each attempt to carry it out is a separate **Execution** record. Retries share one idempotency key, at most one succeeds, and retrying the same payload needs no re-approval. We chose this because approval is the platform's core safety guarantee and must be enforced by data, not by UI state (see [GLOSSARY.md](../../GLOSSARY.md)).

## Considered Options

- **One status field on the Approval covering the full lifecycle** (the original schema draft, with EXECUTED and EXECUTION_FAILED). Rejected: retries and failures would rewrite the decision record and blur the audit trail.
- **Editing a Pending payload in place, freezing it at approval.** Rejected: the Activity Log would show only the final text, not what was originally proposed.

## Consequences

The database ticket must diverge from `docs/plan/schema-draft.prisma`:
- Remove EXECUTED and EXECUTION_FAILED from the approval statuses and add SUPERSEDED.
- Add a Proposed Action model and an Execution model; the Execution model carries the idempotency key.
- Proposed Actions accumulate a row for every edit. That is intended.
