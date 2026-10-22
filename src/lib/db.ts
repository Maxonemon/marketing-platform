import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { dbEnv } from "@/lib/env";

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: dbEnv().DATABASE_URL });
  return new PrismaClient({ adapter });
}

// Reuse one client across dev hot reloads instead of opening a pool per reload.
const globalForDb = globalThis as unknown as { db?: PrismaClient };

export const db: PrismaClient = globalForDb.db ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForDb.db = db;
}

// A write broke a unique constraint, e.g. a slug already taken or a rejection already resubmitted.
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
