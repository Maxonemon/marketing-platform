# 08: Edit and supersede

**What to build:** In the Review, a member can edit the picked Variant and set audience/recipients before submitting. After submission, any material change creates a new Proposed Action with a new Pending Approval and marks the previous Approval SUPERSEDED (pointing to the newer one). A material change is a change to content, audience/recipients, Channel or timing. This applies whether the previous Approval was Pending or Approved but not yet executed successfully, so an approved version can never go out after an edit. Every Proposed Action for a Content Asset is kept and visible as history.

Spec: [../spec.md](../spec.md) (stories 38–39, 41, 54–56, 58). Follows ADR-0001.

**Blocked by:** 04 (Submit → Approve → mock Execution)

**Status:** ready-for-agent

**Run `security-reviewer` before commit** (approvals + execution).

- [ ] Edit before submit updates the Content Asset; rule checks re-run on the edited text (if 07 has landed)
- [ ] Edit after submit: new Proposed Action + Pending Approval, old Approval SUPERSEDED with a supersededBy link, all in one transaction, logged
- [ ] Supersede applies only if the old Approval has no SUCCEEDED Execution (conditional update)
- [ ] The execution service refuses a SUPERSEDED Approval even if an Execution event was already queued
- [ ] The Content Asset page shows the history of its Proposed Actions and their Approval states
- [ ] Tests: edit supersedes a Pending Approval; edit supersedes an Approved-not-executed one and its queued Execution then fails; changing only recipients supersedes; an Approval with a SUCCEEDED Execution is not superseded; old Proposed Actions are unchanged

**From ticket 04's review:**

- [ ] The execution service reads the Approval's status, then claims the attempt in a separate step. A supersede that lands between the two could still let the old version go out once. Re-check that the Approval is still APPROVED in the same step that claims the attempt (e.g. a conditional insert or a row lock), and test it.
