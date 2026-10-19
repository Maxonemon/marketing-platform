# 09: 7-day expiry

**What to build:** A Pending Approval that nobody decided within 7 days becomes EXPIRED, which is final. A periodic background sweep marks overdue Approvals EXPIRED and logs it. Approving or rejecting also re-checks expiry, so an overdue Approval can't be approved even if the sweep hasn't run yet. Time comes from an injected Clock so it can be tested.

Spec: [../spec.md](../spec.md) (stories 52–53).

**Blocked by:** 04 (Submit → Approve → mock Execution)

**Status:** ready-for-agent

**Run `security-reviewer` before commit** (approvals).

- [ ] The Clock is injected into the application layer and services; expiresAt = created + 7 days
- [ ] Periodic Inngest function expires overdue Pending Approvals (conditional update), logged as system actor
- [ ] Decide operations refuse an overdue Approval and mark it EXPIRED
- [ ] Tests (settable Clock, sweep function called directly): at 7 days + 1 s the sweep expires it; approving at 7 days + 1 s fails before any sweep; an expired Approval can't be decided or executed; one decided before the deadline is untouched by the sweep
