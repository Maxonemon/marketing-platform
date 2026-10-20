import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { assertSeparateTestDatabase } from "./database-guard";

// Keeps the DATABASE_URL the run started with, before it is pointed at the test
// database. Vitest workers inherit it from the main process.
const ORIGINAL_URL_KEY = "VITEST_ORIGINAL_DATABASE_URL";

// Every env file Next.js may load a non-test DATABASE_URL from.
const NON_TEST_ENV_FILES = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
  ".env.production",
  ".env.production.local",
];

// Points DATABASE_URL at the test database. Refuses to run when TEST_DATABASE_URL
// is missing, or when it matches the shell's DATABASE_URL or one from an env file.
export function pointAtTestDatabase(): string {
  if (existsSync(".env.test")) process.loadEnvFile(".env.test");

  process.env[ORIGINAL_URL_KEY] ??= process.env.DATABASE_URL ?? "";
  const nonTestUrls = [process.env[ORIGINAL_URL_KEY], ...NON_TEST_ENV_FILES.map(readDatabaseUrl)];
  const testUrl = assertSeparateTestDatabase(process.env.TEST_DATABASE_URL, nonTestUrls);

  process.env.DATABASE_URL = testUrl;
  return testUrl;
}

// Reads DATABASE_URL from an env file without loading it into process.env.
function readDatabaseUrl(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  return parseEnv(readFileSync(path, "utf8")).DATABASE_URL;
}
