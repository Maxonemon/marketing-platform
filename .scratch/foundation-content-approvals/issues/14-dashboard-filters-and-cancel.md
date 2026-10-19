# 14: Dashboard, filters and cancel

**What to build:**
- On sign-in, a member lands on a dashboard showing open Reviews, Pending Approvals, recent failures (Tasks and Executions) and recent activity.
- Task history can be filtered by Brand and status.
- The Activity Log can be filtered by event type, Brand and date.
- A member can cancel a QUEUED Task so it never calls the AI, and can discard a Review without submitting it.

Spec: [../spec.md](../spec.md) (stories 31, 33, 35, 42, 78).

**Blocked by:** 05 (Approval queue and rejection), 10 (Execution failures, retries and idempotency)

**Status:** ready-for-agent

- [ ] Dashboard operation and page, scoped to the current Workspace
- [ ] Filter parameters validated with Zod; filters only narrow within the caller's Workspace
- [ ] Cancel: only a QUEUED Task. The background function checks the status before calling the AI and stops if CANCELLED. Logged
- [ ] Discard Review: Task becomes COMPLETED with no Proposed Action, logged
- [ ] Tests: dashboard counts match seeded data and exclude other Workspaces; filters return the right subsets; a cancelled Task never calls the fake AI; cancelling a RUNNING Task is refused; discarding a Review creates no Approval
