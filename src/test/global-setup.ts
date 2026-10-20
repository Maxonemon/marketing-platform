import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { pointAtTestDatabase } from "./test-env";

const prismaCli = createRequire(import.meta.url).resolve("prisma/build/index.js");

// Prisma's migrate engine gives up after 5 s by default; a cold or distant Neon
// compute can take longer to accept the first connection.
const MIGRATE_CONNECT_TIMEOUT_SECONDS = "30";

// Runs once before the suite: applies migrations to the test database.
export default function setup(): void {
  const databaseUrl = pointAtTestDatabase();
  try {
    execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: withConnectTimeout(databaseUrl) },
      stdio: "pipe",
      encoding: "utf8",
    });
  } catch (error: unknown) {
    const stderr = error instanceof Error && "stderr" in error ? String(error.stderr) : "";
    const reason = stderr.split("\n").find((line) => line.startsWith("Error:")) ?? "see prisma output";
    throw new Error(`Applying migrations to the test database failed. ${reason}`);
  }
}

function withConnectTimeout(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  if (!url.searchParams.has("connect_timeout")) {
    url.searchParams.set("connect_timeout", MIGRATE_CONNECT_TIMEOUT_SECONDS);
  }
  return url.toString();
}
