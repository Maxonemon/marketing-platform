# 11: Members and roles

**What to build:**
- An Owner or Admin invites a person by email with a role (Admin or Member). The person becomes a member the first time they sign in with that email; no email is sent.
- An Owner changes roles and removes members. The last Owner can never be removed or demoted.
- A removed member loses access immediately, including to Approvals they hadn't decided.
- Users in several Workspaces can switch between them.
- Membership and role changes go to the Activity Log.

Spec: [../spec.md](../spec.md) (stories 4–8, 11, 76).

**Blocked by:** 01 (Sign in and create a Workspace)

**Status:** ready-for-agent

**Run `security-reviewer` before commit** (auth).

- [ ] Workspace invitation record (Workspace, email, role), consumed at first sign-in with a matching verified email
- [ ] Invite/change role/remove operations with role checks: Admins can invite Members and Admins; only Owners change roles or remove
- [ ] Last-Owner guard on demote and remove
- [ ] Members page and Workspace switcher
- [ ] Every change is logged
- [ ] Tests: an invite is consumed at sign-in and gives the right role; a Member cannot invite; demoting or removing the last Owner is refused; a removed member's next operation is not-found; a user switching Workspace sees only that Workspace's data
