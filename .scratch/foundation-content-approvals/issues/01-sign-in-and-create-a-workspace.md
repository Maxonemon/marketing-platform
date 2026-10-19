# 01: Sign in and create a Workspace

**What to build:** A person signs in with Google. If they belong to no Workspace, they create one and become its Owner, then land on an (empty) Workspace home page. A signed-out visitor who opens any app page is sent to sign-in. This ticket also sets up the foundations every later ticket uses:
- the database
- the permissions module ("is this user a member of this Workspace with at least role X?")
- the application-layer pattern: one server-side operation per user intent, each taking the acting user and the Workspace, with routes that stay thin
- the real-Postgres test harness

Spec: [../spec.md](../spec.md) (stories 1–3, 9–10).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Needs dependency approval first:** Prisma + Neon driver adapter, Auth.js (and its Prisma adapter). Read the current Prisma docs; the schema draft predates Prisma 7.

- [ ] Signing in with Google creates a User and a database session; signing out ends it
- [ ] A signed-in user with no Workspace is asked to create one (name, slug) and becomes its Owner
- [ ] Every app page and every workspace route redirects or returns 401 when signed out
- [ ] The permissions module refuses non-members and members below the required role; a record from another Workspace is reported as "not found", never "forbidden"
- [ ] Create Workspace is an application-layer operation; the route/server action only parses input and maps the result
- [ ] Application-layer tests run against a real PostgreSQL test database (separate test `DATABASE_URL`, migrations applied, reset between tests) via `pnpm check`
- [ ] Tests: create Workspace makes the caller Owner; a user cannot read a Workspace they don't belong to (not-found); duplicate slug is rejected with a clear error
- [ ] HTTP smoke test: an unauthenticated request to a workspace route is rejected
- [ ] The schema covers only what this ticket needs (Auth.js models, Workspace, membership with Owner/Admin/Member). Later tickets add their own models
- [ ] No secrets in source; required env vars are checked at startup
