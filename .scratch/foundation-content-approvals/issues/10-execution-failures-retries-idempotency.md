# 10: Execution failures, retries and idempotency

**What to build:** When the Channel fails, the Execution attempt is recorded as FAILED with its error and retried in the background. Retries reuse the Approval's idempotency key and need no new approval. A database constraint allows at most one SUCCEEDED Execution per Approval, so overlapping retries or duplicate events never deliver twice. A final failure is logged. The Approval page lists every Execution attempt with its result or error.

Spec: [../spec.md](../spec.md) (stories 63–66).

**Blocked by:** 04 (Submit → Approve → mock Execution)

**Status:** done, closed (2026-10-26). Verified by `pnpm check`: typecheck, lint and 230 tests in 20 files in one clean run. Reviewed by `reviewer`, `security-reviewer` and the code-review skill; their main findings were fixed in the review-fix commit. No browser run. At most 3 attempts per Approval (`MAX_EXECUTION_ATTEMPTS`), one per try of the Inngest function. A Channel throws `NotDeliveredError` when it is sure nothing went out (FAILED, retried); any other error, or an attempt left STARTED for 15 minutes, is UNCERTAIN: never retried, blocks superseding, and a person checks the Channel. The partial unique index needs Prisma's `partialIndexes` preview feature. `MOCK_CHANNEL_FAILED_ATTEMPTS` makes the mock Channel fail its first attempts in dev.

**Run `security-reviewer` before commit** (execution).

- [x] The mock Channel can be told to fail (for tests and dev)
- [x] Each attempt is its own Execution row (attempt number, status, result/error, timestamps), sharing the Approval's idempotency key
- [x] The database enforces at most one SUCCEEDED Execution per Approval; the execution service treats an existing success as "already done" and does not call the Channel again
- [x] Bounded retries; the final failure is logged in the Activity Log
- [x] Error messages stored or shown never contain credentials
- [x] Tests: fail-then-succeed gives two attempts and one success; two concurrent executions of the same Approval call the mock Channel once; a duplicate event after success is a no-op; a final failure is logged

**From ticket 04's review** (ticket 04 makes one attempt per Approval, claimed through the unique (approvalId, attempt)):

- [x] Approve saves APPROVED, then sends the Execution event. If sending fails, the Approval stays APPROVED with no Execution, can't be approved again, and the Approval page says "Executing in the background" forever. Add a way to start it again without a new approval, e.g. a sweep that starts Approved Approvals that have no Execution.
- [x] An Execution left STARTED (the process died mid-delivery) is never finished: a retry is refused as ALREADY_ATTEMPTED. Decide how a stale STARTED attempt is reconciled without risking a second delivery (every attempt carries the same idempotency key to the Channel).
- [x] Story 75 asks for every Execution attempt and its result in the Activity Log. Today a FAILED attempt is recorded on the Approval but not logged.
- [x] The execution service rethrows the Channel's raw error, which ends up in Inngest's run logs. Rethrow a sanitized error so a real Channel's error can never put a credential there.

**From ticket 08's review** (an edit supersedes an Approved Approval only while `canBeSuperseded` in `src/lib/app/approvals.ts` allows it):

- [x] A STARTED attempt blocks superseding, so a stale STARTED attempt also locks that version against edits. Reconciling stale attempts must keep that rule: a version that may have gone out can't be replaced.
- [x] A FAILED attempt doesn't block superseding, which is only safe if FAILED means nothing was sent. If a Channel can fail after delivering (a timeout), record that as "may have been delivered" and block superseding for it too. Retries must also re-check the Approval under its row lock, as `claimAttempt` does, so a superseded Approval is never retried.

**Follow-ups done in this ticket (from its reviews):**

- [x] A result recorded after the reconcile sweep marked the attempt UNCERTAIN keeps that mark unless it succeeded, so a late failure is never retried.
- [x] The sweep sends each event on its own and counts a failed send without logging its error; marking abandoned attempts no longer depends on sending working.
- [x] The sweep also restarts Approved Approvals whose only attempts failed with attempts left and no retry running (e.g. every Inngest retry failed on the database).

**Left open (review findings not fixed):**

- `EXECUTION_RETRIES = 2` in `src/inngest/functions.ts` must stay `MAX_EXECUTION_ATTEMPTS - 1`; nothing checks it.
- `MOCK_CHANNEL_FAILED_ATTEMPTS` is honoured in production too; it should be ignored there once real Channels exist.
- The Channel's result is stored and shown as returned, with no Zod check; validate it when a real Channel arrives (Phase 4).
- The Activity Log says "a failed Execution attempt" for an UNCERTAIN one too; only its message says it may have gone out.
- `approve()` and the sign-in hook log a fixed line with `console.error`; the project has no logger yet.
- "stops after the last attempt fails" takes about 18 s against the 20 s test timeout.
- Slack reporting of a failed Execution (story 63) comes with ticket 13.
