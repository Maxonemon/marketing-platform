import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "@/lib/db";
import { authEnv } from "@/lib/env";

const { BETTER_AUTH_SECRET, BETTER_AUTH_URL } = authEnv();

// Email + password sign-in with database sessions. No email is sent in these
// phases, so there is no email verification or password reset yet.
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  secret: BETTER_AUTH_SECRET,
  baseURL: BETTER_AUTH_URL,
  emailAndPassword: { enabled: true },
});
