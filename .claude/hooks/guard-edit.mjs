// PreToolUse hook on Edit|Write: blocks edits BEFORE they happen.
// - no `any`, @ts-ignore, @ts-nocheck, @ts-expect-error in TS files
// - no direct edits to package.json / lockfile (dependencies need the user)
// - no edits to .env files

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const input = JSON.parse(raw || "{}");
const tool = input.tool_input ?? {};
const file = String(tool.file_path ?? "");
const name = file.split(/[\\/]/).pop() ?? "";
// Edit sends new_string, Write sends content, MultiEdit sends edits[]
const newText = [
  tool.new_string,
  tool.content,
  ...(Array.isArray(tool.edits) ? tool.edits.map((e) => e.new_string) : []),
]
  .filter(Boolean)
  .join("\n");

const block = (msg) => {
  process.stderr.write(msg + "\n");
  process.exit(2);
};

if (name === "package.json" || name === "pnpm-lock.yaml") {
  block(
    "Editing package.json or the lockfile is blocked. If you need a new dependency, " +
      "stop and ask the user. Say which package, why, and what you would do without it.",
  );
}

if (/^\.env(\..*)?$/.test(name) && name !== ".env.example") {
  block("Editing .env files is blocked. Ask the user to set the value. You may edit .env.example.");
}

if (/\.(ts|tsx|mts)$/.test(file) && !/[\\/]\.claude[\\/]/.test(file)) {
  const bad = newText.match(/(:\s*any\b|\bas any\b|<any>|any\[\]|@ts-ignore|@ts-nocheck|@ts-expect-error)/);
  if (bad) {
    block(
      `Blocked: "${bad[0]}" in ${name}. Do not use any or ts-ignore comments. ` +
        "Write a real type, use unknown and narrow it, or validate with Zod.",
    );
  }
}

process.exit(0);
