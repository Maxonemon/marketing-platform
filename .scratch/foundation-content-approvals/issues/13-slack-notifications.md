# 13: Slack notifications

**What to build:** When a Workspace has Slack connected, the team gets a Slack message when:
- a new Approval is Pending (with a link to it in the app)
- a Review is ready
- a Task fails
- an Execution finally fails

Notifications are best effort: a Slack failure is logged as an Integration error and never blocks or rolls back a Task, Approval or Execution. Slack only notifies; deciding happens only in the app.

Spec: [../spec.md](../spec.md) (stories 28, 70–73).

**Blocked by:** 12 (Slack Integration: connect and test), 06 (Real AI provider and three Variants), 10 (Execution failures, retries and idempotency)

**Status:** ready-for-agent

**Run `security-reviewer` before commit** (Integrations).

- [ ] Notifications are sent after the triggering state change is committed, never inside its transaction
- [ ] Messages carry no secrets and no approve/reject actions, only a link
- [ ] No Slack connected → no-op
- [ ] Notifier failure → Activity Log Integration error, original operation still succeeds
- [ ] Tests (fake Notifier): each of the four events sends one message; a failing Notifier leaves the Task/Approval/Execution state correct and logs the error; a Workspace without Slack sends nothing
