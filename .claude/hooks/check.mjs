// Stop hook: Claude cannot say "done" while checks fail or the diff is too big.
// Exit code 2 = block. The stderr text is sent back to Claude so it fixes the problem.
import { execSync } from "node:child_process";

const MAX_DIFF_LINES = 400;

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const input = JSON.parse(raw || "{}");

// Second stop in a row: let Claude stop, so we never loop forever.
if (input.stop_hook_active) process.exit(0);

const run = (cmd) => execSync(cmd, { encoding: "utf8", stdio: "pipe" });

// Only run when code changed. A question-and-answer turn should not run the full suite.
let changed = "";
try {
  changed = run("git status --porcelain -uall");
} catch {
  process.exit(0); // not a git repo yet
}
const codeChanged = changed
  .split("\n")
  .some((line) => /\.(ts|tsx|mts|js|mjs|json|prisma)$/.test(line.trim()));
if (!codeChanged) process.exit(0);

// 1. Diff size guard
try {
  const stat = run("git diff HEAD --shortstat");
  const nums = [...stat.matchAll(/(\d+) (?:insertion|deletion)/g)].map((m) => Number(m[1]));
  const total = nums.reduce((a, b) => a + b, 0);
  if (total > MAX_DIFF_LINES) {
    process.stderr.write(
      `The uncommitted diff is ${total} lines (limit ${MAX_DIFF_LINES}). ` +
        "Do not continue coding. Tell the user the ticket is too big and propose how to split it.\n",
    );
    process.exit(2);
  }
} catch {
  // no HEAD yet: skip the size check
}

// 2. Typecheck + lint + tests
try {
  run("pnpm check");
} catch (e) {
  const out = `${e.stdout ?? ""}\n${e.stderr ?? ""}`.trim();
  process.stderr.write(
    "pnpm check failed. You are not done. Fix the cause (do not skip, delete or weaken tests):\n\n" +
      out.slice(-4000) +
      "\n",
  );
  process.exit(2);
}

process.exit(0);
