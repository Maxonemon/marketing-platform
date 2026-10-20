import { existsSync } from "node:fs";
import { defineConfig, env } from "prisma/config";

// Prisma 7 does not load .env itself. A DATABASE_URL already in the environment
// (the test harness sets one) wins over the file.
if (process.env.DATABASE_URL === undefined && existsSync(".env")) {
  process.loadEnvFile(".env");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
