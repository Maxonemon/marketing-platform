# Marketing Platform

An internal tool for a business or marketing agency. AI agents draft marketing content and research competitors; **a person approves every action before anything is published or sent.**

The approval is enforced on the server, not just shown in the UI. An agent only *proposes*. A person approves an immutable snapshot of exactly what would go out. Only the execution service can carry it out, and only while the approval still matches that snapshot. See [ADR-0001](docs/adr/0001-approve-immutable-proposed-actions-execute-separately.md).

## Status

Built in small tickets, tracked as markdown in [`.scratch/foundation-content-approvals/issues/`](.scratch/foundation-content-approvals/issues/).

| Ticket | State | What it delivers |
|---|---|---|
| 01 | Done | Sign up / sign in with email and password, create a Workspace, sign out |
| 02 | Done | Create, list and edit Brands; an append-only Activity Log any member can browse |
| 03 | Done | Request content for a Brand → background Task (fake AI) → Task history → Review |
| 04–14 | Planned | Approval and mock execution, real AI, Brand rules, expiry, members, Slack, dashboard |

The full feature spec is [`spec.md`](.scratch/foundation-content-approvals/spec.md); the long-term plan is [`docs/plan/marketing-platform.md`](docs/plan/marketing-platform.md).

## Stack

Next.js 16 (App Router, Cache Components) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Zod 4 · Prisma 7 with the `pg` driver adapter on Neon PostgreSQL · Better Auth (email + password, database sessions) · Inngest 4 (background jobs) · Vitest.

Planned: one AI provider SDK (until then a fake provider writes placeholder content).

> **This is not the Next.js in most tutorials.** Version 16 changed APIs and conventions. Read the bundled docs in `node_modules/next/dist/docs/` before writing Next.js code.

## Getting started

You need Node.js 20.9 or newer, pnpm 10, and **two** PostgreSQL databases: one for development and a separate one for tests (tests wipe it). On Neon, a second branch works well.

```sh
pnpm install          # also generates the Prisma client
```

Create `.env` for the app:

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Development database, `postgresql://…` |
| `BETTER_AUTH_SECRET` | Random string, at least 32 characters, e.g. from `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Where the app runs, `http://localhost:3000` in development |
| `INNGEST_DEV` | `1` in development: background jobs go to the local Inngest Dev Server. Elsewhere leave it unset and set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` from your Inngest account. |

Create `.env.test` for the test suite:

| Variable | What it is |
|---|---|
| `TEST_DATABASE_URL` | A **different** database. The tests refuse to run if it matches `DATABASE_URL`. |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | Also needed here (test values are fine): the auth tests load Better Auth, and tests read only `.env.test`. |

Then apply the migrations and start the app:

```sh
pnpm db:migrate:deploy   # apply prisma/migrations to DATABASE_URL
pnpm dev                 # http://localhost:3000
```

Content requests and Executions run as background jobs, so also start the Inngest Dev Server in a second terminal (UI at http://localhost:8288):

```sh
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

Sign up, create a Workspace, add Brands, request content from a Brand's page and follow it in Tasks; the Activity Log is in the Workspace menu.

A missing or invalid environment variable stops the server at startup with the variable's name (never its value).

## Commands

| Command | Does |
|---|---|
| `pnpm dev` | Start the dev server |
| `pnpm check` | Typecheck + lint + all tests. Must pass before a ticket is done. |
| `pnpm vitest run <file>` | Run one test file |
| `pnpm db:migrate:deploy` | Apply migrations to `DATABASE_URL` |
| `pnpm db:migrate` | Create a migration from schema changes (`prisma migrate dev`) |
| `pnpm db:generate` | Regenerate the Prisma client into `src/generated/` |

Tests run against the real test database: migrations are applied once per run and every table is emptied before each test. They run one file at a time, so expect a full run to take a few minutes on a remote database.

## Troubleshooting

- **A request or test fails with `ETIMEDOUT` or an empty Prisma error.** Neon suspends idle databases, and the first connection while it wakes can time out. Retry; if it keeps happening, check the database in the Neon console.
- **`TEST_DATABASE_URL is not set` or "points at the same database".** Add a separate test database to `.env.test` (see above).
- **Port 3000 is already in use.** Another `next dev` or `next start` is still running; stop it first.
- **`pnpm dev` stops with "Missing or invalid environment variables: INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY".** Add `INNGEST_DEV=1` to `.env` (see above).
- **A Task stays Queued.** The Inngest Dev Server doesn't know the app: its Apps page (http://localhost:8288) shows it unreachable or missing. With `pnpm dev` running, `curl -X PUT http://localhost:3000/api/inngest` registers it, then request the content again; events sent before that are not replayed.

## How the code is organised

```
src/
  app/                 Pages, server actions and route handlers. Thin: parse input,
                       call one application-layer operation, map the result.
  lib/app/             Application layer: one operation per user intent
                       (createWorkspace, createBrand, listActivity, …). Each takes
                       the acting user and the Workspace and returns a Result.
                       This is where the tests live.
  lib/permissions.ts   "Is this user a member of this Workspace with at least role X?"
  lib/session.ts       The only way to get the acting user: from a verified session.
  lib/limits.ts        Input limits shared by server validation and forms.
  lib/ai/              The AI provider interface (and its fake) and the agents.
  inngest/             Inngest client, events and background functions.
  proxy.ts             Sends signed-out visitors to /sign-in (optimistic check only).
  test/                Test database harness and fixtures.
prisma/                Schema and migrations.
docs/adr/              Architecture decisions.
GLOSSARY.md            The domain language: Workspace, Brand, Proposed Action, Approval, …
```

### Rules every change keeps

Some of these guard parts that later tickets build; they apply from the first line of that code.

- Agents return structured, Zod-validated data. They never publish, send or call external APIs.
- Only the execution service executes, and only for an Approved approval whose payload hash still matches.
- Every operation that touches workspace data checks membership first. A record from another Workspace is reported as **not found**, never "forbidden", so guessed IDs reveal nothing.
- The Activity Log is append-only: there is one append function and no update or delete in code.
- AI calls go through one provider module with a max token limit, and long jobs run in the background, never inside a request.
- Integration credentials are stored encrypted and never logged or shown.

## Working on it with Claude Code

The repo is set up to be built ticket by ticket with [Claude Code](https://claude.com/claude-code). `CLAUDE.md` holds the project rules it follows.

**For each ticket**

1. `/clear` so the session starts empty. One ticket per session.
2. Optional: Shift+Tab for plan mode and ask for a plan. Check that it names real files.
3. `/implement <ticket path>`. It works test-first (`/tdd`) and ends with a two-axis `/code-review` (standards and spec). On top of that, `CLAUDE.md` has Claude run `pnpm check` and the read-only `reviewer` agent (plus `security-reviewer` for auth, approvals, execution or integrations) before each commit.
4. Read the review findings and `git diff --stat`. You decide which findings to fix, and each commit asks for your approval.
5. If the session gets long or vague: `/handoff`, then start fresh.

**For a new feature**: `/grill-with-docs` on the idea (decisions land in `GLOSSARY.md` and `docs/adr/`), then `/to-spec`, then `/to-tickets`.

**Every week or so**: `/retro` to fix `CLAUDE.md`, hooks or skills based on what went wrong.

### What is enforced, not just asked

| Risk | Guard | Where |
|---|---|---|
| Says "done" while checks fail | A Stop hook runs `pnpm check`; Claude can't finish until it passes | `.claude/hooks/check.mjs` |
| Diff too big to review | The same hook blocks when the uncommitted diff is over 400 lines | `.claude/hooks/check.mjs` |
| `any` or `@ts-ignore` | Blocked before the edit, and ESLint errors on them | `.claude/hooks/guard-edit.mjs`, `eslint.config.mjs` |
| Unapproved dependency | `pnpm add`, `npm install` and `npx` are denied; editing `package.json` is blocked | `.claude/settings.json`, `guard-edit.mjs` |
| Reading your secrets | Reading or editing `.env` files is blocked | `.claude/settings.json`, `guard-edit.mjs` |
| Tests wiping a real database | Tests refuse to start unless `TEST_DATABASE_URL` is a separate database | `src/test/database-guard.ts` |
| A reviewer "fixing" code | Review agents only have Read, Grep and Glob | `.claude/agents/` |
| Invented functions | Strict TypeScript with `noUncheckedIndexedAccess`; the reviewer checks calls with Grep | `tsconfig.json`, `.claude/agents/reviewer.md` |
| Pushing or wiping work | `git push`, `git reset --hard` and `rm -rf` are denied; commits ask first | `.claude/settings.json` |

### Adding a dependency

Claude stops and asks: which package, why, and what it would do without it. If you agree, install it yourself with `pnpm add <package>`.

### What's in `.claude/`

- **Skills** from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT): grill-with-docs, grilling, to-spec, to-tickets, implement, tdd, code-review, codebase-design, domain-modeling, improve-codebase-architecture, diagnosing-bugs, handoff, retro, writing-for-agents, setup-matt-pocock-skills.
- **From [ECC](https://github.com/affaan-m/ECC)** (MIT): the `security-review` skill, the `security-reviewer` agent (made read-only, with project checks) and a few rules in `.claude/rules/ecc/`.
- **Project's own**: the `reviewer` agent, both hooks, `settings.json`.

Marketing skills are left out on purpose: they belong to the app's content agent later, not to Claude Code.

## Costs

- Claude Code runs on a Claude subscription, not an API key.
- Don't run Claude unattended in loops until the workflow is stable.
- In the app (once AI calls arrive in tickets 03 and 06), every AI call must have a max token limit and a retry cap, and each Task records its token usage.
