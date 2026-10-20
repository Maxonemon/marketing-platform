# Better Auth with email + password, not Auth.js with Google

Sign-in uses Better Auth with database sessions and email + password. The spec proposed Auth.js with one OAuth provider (Google). We switched at ticket 01 because Better Auth is the actively developed option for Next.js (the Auth.js maintainers joined it in 2025), its Prisma adapter is built in, and email + password needs no external provider account to get started.

## Considered Options

- **Auth.js v5 with Google** (the spec's proposal). Rejected: v5 is still published under a beta tag, and Google sign-in needs OAuth credentials for every environment before anyone can sign in.
- **Magic-link email sign-in.** Rejected for these phases: it needs an email provider, which the spec keeps out of scope.

## Consequences

- The schema uses Better Auth's core tables (User, Session, Account, Verification), not the Auth.js models in `docs/plan/schema-draft.prisma`.
- There is no email verification or password reset until an email provider is added. A forgotten password can only be reset by hand in the database.
- Identity always comes from `auth.api.getSession` (see `src/lib/session.ts`), never from request input.
- Adding Google later is a configuration change (`socialProviders`), not a migration.
