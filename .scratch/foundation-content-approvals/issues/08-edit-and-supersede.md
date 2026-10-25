# 08: Edit and supersede

**What to build:** In the Review, a member can edit the picked Variant and set audience/recipients before submitting. After submission, any material change creates a new Proposed Action with a new Pending Approval and marks the previous Approval SUPERSEDED (pointing to the newer one). A material change is a change to content, audience/recipients, Channel or timing. This applies whether the previous Approval was Pending or Approved but not yet executed successfully, so an approved version can never go out after an edit. Every Proposed Action for a Content Asset is kept and visible as history.

Spec: [../spec.md](../spec.md) (stories 38–39, 41, 54–56, 58). Follows ADR-0001.

**Blocked by:** 04 (Submit → Approve → mock Execution)

**Status:** done, closed (2026-10-25). Verified by typecheck, lint and 195 tests in 19 files: 15 files in one full run, the other 4 run alone after that run collided with the Stop hook's (Neon was slow that day: 20 s timeouts, expired transactions). Then driven end to end against the running app and Inngest Dev Server, by submitting the real pages' forms over HTTP (no browser): sign up, Brand, Review edit with a rule warning, submit with an audience, edit after submit (supersede), history, approve, execute, edit refused (22 checks passed). An attempt that is STARTED blocks superseding as well as a SUCCEEDED one (it may already be going out); a FAILED one doesn't. The audience is optional free text on one line. History is on the new Content Asset page.

**Run `security-reviewer` before commit** (approvals + execution).

- [x] Edit before submit updates the Content Asset; rule checks re-run on the edited text (if 07 has landed)
- [x] Edit after submit: new Proposed Action + Pending Approval, old Approval SUPERSEDED with a supersededBy link, all in one transaction, logged
- [x] Supersede applies only if the old Approval has no SUCCEEDED Execution (conditional update)
- [x] The execution service refuses a SUPERSEDED Approval even if an Execution event was already queued
- [x] The Content Asset page shows the history of its Proposed Actions and their Approval states
- [x] Tests: edit supersedes a Pending Approval; edit supersedes an Approved-not-executed one and its queued Execution then fails; changing only recipients supersedes; an Approval with a SUCCEEDED Execution is not superseded; old Proposed Actions are unchanged

**From ticket 04's review:**

- [x] The execution service reads the Approval's status, then claims the attempt in a separate step. A supersede that lands between the two could still let the old version go out once. Re-check that the Approval is still APPROVED in the same step that claims the attempt (e.g. a conditional insert or a row lock), and test it.

**Follow-ups done in this ticket:**

- [x] Editing a Rejected Approval proposes the edited content as its resubmission; the rejected one stays as it was. An edit and a resubmit at the same moment give one resubmission.
- [x] Each Proposed Action stores the Brand rule warnings of the text it proposed (migration 0012 backfills those whose text matches their Content Asset), so an older Approval shows its own warnings.
- [x] Stale STARTED and ambiguous FAILED attempts are noted in ticket 10.
