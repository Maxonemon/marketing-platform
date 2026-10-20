import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Points DATABASE_URL at the test database. Tests truncate every table, so this
// refuses to run without a TEST_DATABASE_URL that differs from the dev DATABASE_URL.
export function pointAtTestDatabase(): string {
  if (existsSync(".env.test")) process.loadEnvFile(".env.test");

  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error("TEST_DATABASE_URL is not set. Add it to .env.test (a dedicated test database).");
  }
  if (testUrl === readDevDatabaseUrl()) {
    throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL in .env: tests wipe the database.");
  }

  process.env.DATABASE_URL = testUrl;
  return testUrl;
}

// Reads .env without loading it into process.env.
function readDevDatabaseUrl(): string | undefined {
  if (!existsSync(".env")) return undefined;
  return parseEnv(readFileSync(".env", "utf8")).DATABASE_URL;
}
