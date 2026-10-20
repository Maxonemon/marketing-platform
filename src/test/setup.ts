import "./point-at-test-database";
import { afterAll, beforeEach } from "vitest";
import { db } from "@/lib/db";

// Every test starts from an empty database (migrations stay applied).
beforeEach(async () => {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  // Names come from the catalog, not from input.
  const list = tables.map(({ tablename }) => `"public"."${tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await db.$disconnect();
});
