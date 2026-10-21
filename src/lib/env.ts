import { z } from "zod";

// Required env vars, checked lazily and once at startup (src/instrumentation.ts).
// Errors name the missing or invalid variables, never their values.

// z.url() alone accepts "localhost:3000" (it reads "localhost:" as the scheme).
const dbEnvSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

const authEnvSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url({ protocol: /^https?$/ }),
});

// The Inngest SDK reads these itself. In dev mode (INNGEST_DEV=1, with the local Dev
// Server) it needs neither; otherwise sending events needs the event key and serving
// functions the signing key.
const inngestCloudEnvSchema = z.object({
  INNGEST_EVENT_KEY: z.string().min(1),
  INNGEST_SIGNING_KEY: z.string().min(1),
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

// `mode` is the Inngest client's own reading of INNGEST_DEV, so this check and the SDK
// agree. Dev mode skips request signature checks, so production must never run in it.
export function inngestEnv(mode: "dev" | "cloud"): void {
  if (mode === "cloud") {
    parseEnv(inngestCloudEnvSchema);
  } else if (process.env.NODE_ENV === "production") {
    throw new Error("Missing or invalid environment variables: INNGEST_DEV");
  }
}
