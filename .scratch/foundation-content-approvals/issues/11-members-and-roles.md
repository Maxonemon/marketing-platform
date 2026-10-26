# 11: Members and roles

**What to build:**
- An Owner or Admin invites a person by email with a role (Admin or Member). The person becomes a member the first time they sign in with that email; no email is sent.
- An Owner changes roles and removes members. The last Owner can never be removed or demoted.
- A removed member loses access immediately, including to Approvals they hadn't decided.
- Users in several Workspaces can switch between them.
- Membership and role changes go to the Activity Log.

Spec: [../spec.md](../spec.md) (stories 4–8, 11, 76).

**Blocked by:** 01 (Sign in and create a Workspace)

**Status:** done, closed (2026-10-26). Verified by `pnpm check`: typecheck, lint and 230 tests in 20 files in one clean run. Reviewed by `reviewer`, `security-reviewer` and the code-review skill; their main findings were fixed in the review-fix commit. No browser run. Emails are not verified (ADR-0002), so an invitation is consumed by the first sign-in whose account email matches, case-insensitively (decided 2026-10-26): whoever signs up first with an invited email gets it. Consumption runs in Better Auth's session-create hook, so someone already signed in joins at their next sign-in. Role changes and removals lock the Workspace's row and re-check that the actor is still an Owner.

**Run `security-reviewer` before commit** (auth).

- [x] Workspace invitation record (Workspace, email, role), consumed at first sign-in with a matching verified email (matching email, not verified: see Status)
- [x] Invite/change role/remove operations with role checks: Admins can invite Members and Admins; only Owners change roles or remove
- [x] Last-Owner guard on demote and remove
- [x] Members page and Workspace switcher
- [x] Every change is logged
- [x] Tests: an invite is consumed at sign-in and gives the right role; a Member cannot invite; demoting or removing the last Owner is refused; a removed member's next operation is not-found; a user switching Workspace sees only that Workspace's data

**Follow-ups done in this ticket (from its reviews):**

- [x] Removing a member deletes the Workspace's pending invitations they sent or that are for their email.
- [x] An invitation consumed by someone already a member changes nothing and logs nothing.
- [x] A failure to accept invitations no longer fails the sign-in; the next sign-in tries again.

**Left open (review findings not fixed):**

- A pending invitation can't be revoked. This matters more while emails are unverified: a wrong Admin invitation stays live until someone signs up with that email.
- No cap on pending invitations per Workspace.
- Member names and emails are stored in the append-only Activity Log, so they can't be erased later.
- The role list ("OWNER", "ADMIN", "MEMBER") and the "Owner or Admin" check are repeated across several files.
