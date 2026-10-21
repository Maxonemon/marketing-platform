# 10: Execution failures, retries and idempotency

**What to build:** When the Channel fails, the Execution attempt is recorded as FAILED with its error and retried in the background. Retries reuse the Approval's idempotency key and need no new approval. A database constraint allows at most one SUCCEEDED Execution per Approval, so overlapping retries or duplicate events never deliver twice. A final failure is logged. The Approval page lists every Execution attempt with its result or error.

Spec: [../spec.md](../spec.md) (stories 63–66).

**Blocked by:** 04 (Submit → Approve → mock Execution)

**Status:** ready-for-agent

**Run `security-reviewer` before commit** (execution).

- [ ] The mock Channel can be told to fail (for tests and dev)
- [ ] Each attempt is its own Execution row (attempt number, status, result/error, timestamps), sharing the Approval's idempotency key
- [ ] The database enforces at most one SUCCEEDED Execution per Approval; the execution service treats an existing success as "already done" and does not call the Channel again
- [ ] Bounded retries; the final failure is logged in the Activity Log
- [ ] Error messages stored or shown never contain credentials
- [ ] Tests: fail-then-succeed gives two attempts and one success; two concurrent executions of the same Approval call the mock Channel once; a duplicate event after success is a no-op; a final failure is logged

**From ticket 04's review** (ticket 04 makes one attempt per Approval, claimed through the unique (approvalId, attempt)):

- [ ] Approve saves APPROVED, then sends the Execution event. If sending fails, the Approval stays APPROVED with no Execution, can't be approved again, and the Approval page says "Executing in the background" forever. Add a way to start it again without a new approval, e.g. a sweep that starts Approved Approvals that have no Execution.
- [ ] An Execution left STARTED (the process died mid-delivery) is never finished: a retry is refused as ALREADY_ATTEMPTED. Decide how a stale STARTED attempt is reconciled without risking a second delivery (every attempt carries the same idempotency key to the Channel).
- [ ] Story 75 asks for every Execution attempt and its result in the Activity Log. Today a FAILED attempt is recorded on the Approval but not logged.
- [ ] The execution service rethrows the Channel's raw error, which ends up in Inngest's run logs. Rethrow a sanitized error so a real Channel's error can never put a credential there.
