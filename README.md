# Marketing Platform

AI marketing tool for my business. Agents research competitors and draft content. I approve before anything goes public.

The plan is in `docs/plan/marketing-platform.md`.

---

## First time setup (Windows, PowerShell)

```
cd C:\Users\abdou\marketing-platform
pnpm install
pnpm check
```

`pnpm check` must pass (1 test) before you start. Then open Claude Code in this folder:

```
claude
```

Inside Claude Code, run once:

```
/setup-matt-pocock-skills
```

Choose **Local markdown** for the issue tracker (tickets live in `.scratch/`). Keep the default domain docs.

---

## The workflow

### Once, at the start
1. `/grill-with-docs` then say: "Grill me on docs/plan/marketing-platform.md". Answer the questions. Decisions go into `GLOSSARY.md` and `docs/adr/`.
2. `/to-spec` → writes the spec.
3. `/to-tickets` → small tickets in `.scratch/`.

The first ticket must be a **tracer bullet**: create brand → generate 1 post (mock AI) → approval → mock publish → log. Thin, but end to end.

### For every ticket
1. `/clear` (new, empty context). One ticket per session.
2. Press **Shift+Tab** to go into plan mode. Ask for a plan for the ticket. Check that it names real files.
3. `/implement <ticket path>` (it uses `/tdd`: test first, then code).
4. Before commit: Claude writes `.review/diff.patch` and runs the `reviewer` agent (and `security-reviewer` for auth/approval/execution work).
5. You read `git diff --stat` and the findings. **You** commit.
6. Session getting long or vague? `/handoff`, then start fresh.

### Every week
`/retro` → fix CLAUDE.md, hooks or skills based on what went wrong.

---

## What is enforced (not just asked)

| Problem | Guard | Where |
|---|---|---|
| Says "done" with failing tests | Stop hook runs `pnpm check`. Claude cannot stop until it passes. | `.claude/hooks/check.mjs` |
| Diff too big | Stop hook blocks when the diff is over 400 lines. | `.claude/hooks/check.mjs` |
| `any` / `@ts-ignore` | Blocked before the edit + ESLint errors. | `.claude/hooks/guard-edit.mjs`, `eslint.config.mjs` |
| Unwanted dependency | `pnpm add`, `npm install`, `npx` denied. Editing `package.json` blocked. You add packages yourself. | `.claude/settings.json`, `guard-edit.mjs` |
| Reads your secrets | `.env` reads and edits blocked. | `.claude/settings.json` |
| Reviewer "fixes" code | Reviewers have only Read/Grep/Glob tools. | `.claude/agents/` |
| Invents functions | Strict TypeScript (`noUncheckedIndexedAccess` too) + reviewer checks with Grep. | `tsconfig.json`, `reviewer.md` |
| Pushes or wipes work | `git push`, `git reset --hard`, `rm -rf` denied. Commits ask you first. | `.claude/settings.json` |

Context rot, drift and vague answers are handled by the **workflow**: one ticket per session, `/clear`, `/handoff`, spec in files.

---

## Adding a dependency

Claude will stop and ask. If you agree, run it yourself:

```
pnpm add <package>
```

Planned later: `prisma` + `@prisma/client` (database ticket), `next-auth`, `inngest`, an AI SDK.

---

## What's inside `.claude/`

**Skills** (from [mattpocock/skills](https://github.com/mattpocock/skills), MIT):
setup-matt-pocock-skills, grill-with-docs, grilling, to-spec, to-tickets, implement, tdd, code-review, codebase-design, domain-modeling, improve-codebase-architecture, diagnosing-bugs, handoff, retro, writing-for-agents.

**From [ECC](https://github.com/affaan-m/ECC)** (MIT): `security-review` skill, `security-reviewer` agent (made read-only, plus project checks), and a few rules in `.claude/rules/ecc/` (common security + coding style, TypeScript rules).

**Own files**: `reviewer` agent, the two hooks, `settings.json`, `CLAUDE.md`.

Not installed on purpose: marketing skills (those belong to the app's content agent later, not to Claude Code), and the full ECC pack (too much context).

## Costs
- Use your Claude subscription, not an API key, for Claude Code.
- Don't run Claude unattended in loops until this workflow is stable.
- In the app: every AI call has a max token limit and a retry cap. Log tokens per task.
