# 14: Dashboard, filters and cancel

**What to build:**
- On sign-in, a member lands on a dashboard showing open Reviews, Pending Approvals, recent failures (Tasks and Executions) and recent activity.
- Task history can be filtered by Brand and status.
- The Activity Log can be filtered by event type, Brand and date.
- A member can cancel a QUEUED Task so it never calls the AI, and can discard a Review without submitting it.

Spec: [../spec.md](../spec.md) (stories 31, 33, 35, 42, 78).

**Blocked by:** 05 (Approval queue and rejection), 10 (Execution failures, retries and idempotency)

**Status:** done, closed (2026-10-26). Verified by typecheck, lint and the full suite (277 tests in 25 files). The full run had 7 failures: 5 were the slow-Neon signatures (empty Prisma errors, transaction start and hook timeouts) and 2 came from test edits made while it ran. All 4 affected files then passed together, 79/79, with `--network-family-autoselection-attempt-timeout=2000`. Reviewed by `reviewer` and `security-reviewer`: no blockers; the findings fixed and left open are listed below. The Dashboard was seen in the browser against the dev database (migrated with `pnpm db:migrate:deploy`). The Dashboard (`getDashboard`, src/lib/app/dashboard.ts) is the Workspace home page: counts and the oldest 5 open Reviews and Pending Approvals, the last 5 failures (failed Tasks and final Execution failures) and the last 10 entries. Filters are a GET form, so they live in the URL. Cancel and Discard ask for confirmation in the browser. The same session restyled the app (design tokens in globals.css, a sidebar shell), at the user's request.

- [x] Dashboard operation and page, scoped to the current Workspace
- [x] Filter parameters validated with Zod; filters only narrow within the caller's Workspace
- [x] Cancel: only a QUEUED Task. The background function checks the status before calling the AI and stops if CANCELLED. Logged
- [x] Discard Review: Task becomes COMPLETED with no Proposed Action, logged
- [x] Tests: dashboard counts match seeded data and exclude other Workspaces; filters return the right subsets; a cancelled Task never calls the fake AI; cancelling a RUNNING Task is refused; discarding a Review creates no Approval

**Fixed from review:** cancelling also matches the Workspace in its update, not only in the lookup before it.

**Left open (review findings not fixed):**

- Any member can cancel or discard any Task in the Workspace, as with editing and submitting. Confirm that is
  intended.
- `listActivity` has no test for a Brand id from another Workspace (`listTasks` has one; both scope by Workspace).
- No rate limit on cancel and discard (each is idempotent per Task).
