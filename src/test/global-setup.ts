import { execFileSync } from "node:child_process";
import { pointAtTestDatabase } from "./test-env";

const PRISMA_CLI = "node_modules/prisma/build/index.js";

// Runs once before the suite: applies migrations to the test database.
export default function setup(): void {
  const databaseUrl = pointAtTestDatabase();
  execFileSync(process.execPath, [PRISMA_CLI, "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
}
