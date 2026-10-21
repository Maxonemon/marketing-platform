# 04: Submit → Approve → mock Execution (tracer bullet, part 2)

**What to build:** From a Review, a member picks the Variant and submits it. This creates an immutable Proposed Action and a Pending Approval, and the Task becomes COMPLETED. The Proposed Action is a canonical snapshot of content, Channel, audience/recipients and timing ("as soon as approved"), stored with its SHA-256 payload hash. An Owner or Admin (self-approval allowed) approves it on the Approval page; a Member is refused by the server. Approving starts a background Execution. The execution service re-reads the Approval and Proposed Action, checks APPROVED and recomputes the hash, then calls the **mock Channel**, which records what it would have sent. The Execution and the decision are both in the Activity Log. This completes the tracer bullet.

Spec: [../spec.md](../spec.md) (stories 40, 43–44, 46, 48–49, 59–62, 74–75). Follows ADR-0001.

**Blocked by:** 03 (Request content → Review)

**Status:** done (2026-10-21). Verified by `pnpm check` (14 test files, 108 tests) and `next build`. Not yet tried in the browser with the Inngest Dev Server. Follow-ups from the reviews are noted in tickets 06, 08 and 10.

**Run `security-reviewer` before commit** (approvals + execution).

- [x] Schema follows ADR-0001: Proposed Action model (immutable, no update path); Approval one-to-one with a Proposed Action, statuses PENDING / APPROVED / REJECTED / EXPIRED / SUPERSEDED; Execution model with idempotency key and status STARTED / SUCCEEDED / FAILED
- [x] Payload canonicalization + hash is a pure function with unit tests (same input → same hash; any field change → different hash)
- [x] Approve is allowed only for Owner/Admin. It uses a conditional "only if still PENDING" update and sends the Execution event
- [x] Only the execution service executes. It refuses unless the status is APPROVED and the recomputed hash matches
- [x] The Channel adapter interface exists with a mock implementation that records deliveries
- [x] The placeholder approval-rules module is replaced by the real services; its rule (only APPROVED executes) is kept in the new tests, never weakened
- [x] Approval page shows the exact Proposed Action, its Content Asset, Task and Brand
- [x] Tests: the full tracer bullet (Brand → Task → Review → submit → approve → Execution SUCCEEDED → mock Channel received exact payload → Activity Log has decision + Execution); a Member cannot approve; self-approval works; executing a PENDING Proposed Action fails; a tampered stored payload (hash mismatch) fails; cross-Workspace approve is not-found
