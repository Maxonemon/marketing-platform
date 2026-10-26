# 13: Slack notifications

**What to build:** When a Workspace has Slack connected, the team gets a Slack message when:
- a new Approval is Pending (with a link to it in the app)
- a Review is ready
- a Task fails
- an Execution finally fails

Notifications are best effort: a Slack failure is logged as an Integration error and never blocks or rolls back a Task, Approval or Execution. Slack only notifies; deciding happens only in the app.

Spec: [../spec.md](../spec.md) (stories 28, 70–73).

**Blocked by:** 12 (Slack Integration: connect and test), 06 (Real AI provider and three Variants), 10 (Execution failures, retries and idempotency)

**Status:** done, closed (2026-10-26). Verified by typecheck, lint and the full suite (277 tests in 25 files). The full run had 7 failures: 5 were the slow-Neon signatures (empty Prisma errors, transaction start and hook timeouts) and 2 came from test edits made while it ran. All 4 affected files then passed together, 79/79, with `--network-family-autoselection-attempt-timeout=2000`. Reviewed by `reviewer` and `security-reviewer`: no blockers; the findings fixed and left open are listed below. The Dashboard was seen in the browser against the dev database (migrated with `pnpm db:migrate:deploy`). `notifyTeam` (src/lib/app/notifications.ts) never throws; it sends the escaped Brand name and a link built from `BETTER_AUTH_URL`. The content runner, the execution service and the reconcile sweep call it after their transactions; the three server actions that create a Pending Approval call it after the operation returns. A failure is logged as `NOTIFICATION_FAILED`.

**Run `security-reviewer` before commit** (Integrations).

- [x] Notifications are sent after the triggering state change is committed, never inside its transaction
- [x] Messages carry no secrets and no approve/reject actions, only a link
- [x] No Slack connected → no-op
- [x] Notifier failure → Activity Log Integration error, original operation still succeeds
- [x] Tests (fake Notifier): each of the four events sends one message; a failing Notifier leaves the Task/Approval/Execution state correct and logs the error; a Workspace without Slack sends nothing

**Fixed from review:** the reconcile sweep's notification is tested (once, however often it runs); the
Execution message no longer says "couldn't be delivered", as an UNCERTAIN attempt may have gone out; Brand names
are put on one line, stripped of Slack formatting characters and capped at 80 characters.

**Left open (review findings not fixed):**

- The Pending Approval notification is sent from the server actions, inside the request (bounded by the
  Notifier's 10 s timeout), and no test fails if those calls are removed. Better: an Inngest event and a
  background function, tested at the app layer.
- An unexpected error inside `notifyTeam` (database, a bad `BETTER_AUTH_URL`, the log write itself) only reaches
  the server log, not the Activity Log.
- An unreadable webhook URL writes a `NOTIFICATION_FAILED` entry on every event; there's no rate limit.
- A crash between the sweep's commit and its notification loses the notification (best effort).
- A Task that fails to start in `requestContent` (the member sees the error at once) sends no notification.
