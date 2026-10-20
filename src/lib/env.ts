import { z } from "zod";

// Required env vars, checked lazily and once at startup (src/instrumentation.ts).
// Errors name the missing or invalid variables, never their values.

const dbEnvSchema = z.object({
  DATABASE_URL: z.url(),
});

const authEnvSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
});

export type DbEnv = z.infer<typeof dbEnvSchema>;
export type AuthEnv = z.infer<typeof authEnvSchema>;

function parseEnv<T>(schema: z.ZodType<T>): T {
  const result = schema.safeParse(process.env);
  if (result.success) return result.data;
  const names = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
  throw new Error(`Missing or invalid environment variables: ${names.join(", ")}`);
}

export function dbEnv(): DbEnv {
  return parseEnv(dbEnvSchema);
}

export function authEnv(): AuthEnv {
  return parseEnv(authEnvSchema);
}
