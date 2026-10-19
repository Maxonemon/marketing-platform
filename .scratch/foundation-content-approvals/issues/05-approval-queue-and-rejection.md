# 05: Approval queue and rejection

**What to build:** Approvers get an approval queue of Pending Approvals in their Workspace, oldest first. They can reject with a required comment, which the author sees on the Approval. A decision is made once: deciding an Approval that is no longer Pending is refused, and two Approvers deciding at the same moment produce exactly one decision. After a rejection, the author can resubmit the Content Asset as a new Proposed Action with a new Pending Approval; the rejected one stays unchanged.

Spec: [../spec.md](../spec.md) (stories 45, 47, 50–51, 57).

**Blocked by:** 04 (Submit → Approve → mock Execution)

**Status:** ready-for-agent

**Run `security-reviewer` before commit** (approvals).

- [ ] Approval queue page and list operation (Pending only, oldest first, current Workspace only)
- [ ] Reject operation: Owner/Admin only, comment required, "only if still PENDING" conditional update, logged with the comment
- [ ] Resubmit creates a new Proposed Action + Pending Approval; the rejected records are untouched
- [ ] Tests: reject without a comment is refused; approve-after-reject and reject-after-approve are refused; concurrent approve + reject leave exactly one decision; resubmit creates a new Approval and keeps the old one REJECTED; the queue never shows another Workspace's Approvals
