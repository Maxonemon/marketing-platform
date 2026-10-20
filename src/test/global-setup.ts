import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { pointAtTestDatabase } from "./test-env";

const prismaCli = createRequire(import.meta.url).resolve("prisma/build/index.js");

// Runs once before the suite: applies migrations to the test database.
export default function setup(): void {
  const databaseUrl = pointAtTestDatabase();
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
}
