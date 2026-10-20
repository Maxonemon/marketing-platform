import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Prisma 7 does not load .env itself. A DATABASE_URL already in the environment
// (the test harness sets one) wins over the file.
if (process.env.DATABASE_URL === undefined && existsSync(".env")) {
  process.loadEnvFile(".env");
}

const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // `prisma generate` (postinstall) needs no database, so a fresh clone or CI build
  // without DATABASE_URL still installs. Migrate commands fail if it is missing.
  ...(url ? { datasource: { url } } : {}),
});
