@AGENTS.md

# Marketing platform

Internal AI marketing tool: agents draft content and research; a human approves before anything is published or sent.
Full plan: `docs/plan/marketing-platform.md`. Schema draft: `docs/plan/schema-draft.prisma`.

## Stack
Next.js App Router · TypeScript strict · Zod · Vitest · Tailwind. Planned (added by tickets): Prisma + Neon, Auth.js, Inngest.

## Commands
- `pnpm check` = typecheck + lint + tests. Run it before you say a ticket is done (a hook also runs it).
- `pnpm vitest run <file>` = one test file.

## How we work
- One ticket per session. The ticket lists the files you may change. Ask before touching any other file.
- Read a file before you change it. Never call a function you have not seen in the code.
- Small diffs. If a change grows past ~300 lines, stop and propose a split.
- New dependency = stop and ask me (package, reason, alternative). You cannot install packages.
- Tests: never delete, skip or weaken a test to make the suite pass.
- Reviews are read-only. A reviewer reports; I decide what to fix.

## Architecture rules (do not break)
- Agents return structured data (Zod-validated). They never publish, send or call external APIs.
- Only `src/lib/workflows/execution-service.ts` executes actions, and only for an APPROVED approval whose payloadHash matches.
- Every route/server action that touches workspace data checks membership via `src/lib/permissions.ts`.
- AI calls go through `src/lib/ai/provider.ts` with a max token limit. No AI calls inside a request handler for long jobs: use background jobs.
- Integration credentials are stored encrypted and never logged.

## Before commit
1. `git diff HEAD > .review/diff.patch`
2. Run the `reviewer` agent (and `security-reviewer` if the ticket touches auth, approvals, execution or integrations).
3. Show me the findings and `git diff --stat`. I commit.
