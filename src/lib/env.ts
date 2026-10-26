import { z } from "zod";
import { AI_MODELS, isMistralModel, type AiModel, type MistralModel } from "@/lib/ai/pricing";

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

// AI_MODEL names a model of src/lib/ai/pricing.ts, and with it the provider that
// serves it. Each provider needs its own key; the fake one needs none.
const aiModelEnvSchema = z.object({
  AI_MODEL: z.enum(Object.keys(AI_MODELS) as [AiModel, ...AiModel[]]),
});

const mistralEnvSchema = z.object({
  MISTRAL_API_KEY: z.string().min(1),
});

// Dev only: the mock Channel fails attempts up to this number (src/lib/channels/mock-channel.ts).
const mockChannelEnvSchema = z.object({
  MOCK_CHANNEL_FAILED_ATTEMPTS: z.coerce.number().int().min(0).default(0),
});

export type DbEnv = z.infer<typeof dbEnvSchema>;
export type AuthEnv = z.infer<typeof authEnvSchema>;
export type AiEnv =
  | { provider: "fake"; model: "fake" }
  | { provider: "mistral"; model: MistralModel; mistralApiKey: string };

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

// The fake model writes placeholders, so production must never run on it.
export function aiEnv(): AiEnv {
  const { AI_MODEL: model } = parseEnv(aiModelEnvSchema);
  if (isMistralModel(model)) {
    const { MISTRAL_API_KEY } = parseEnv(mistralEnvSchema);
    return { provider: "mistral", model, mistralApiKey: MISTRAL_API_KEY };
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Missing or invalid environment variables: AI_MODEL");
  }
  return { provider: "fake", model };
}

export function mockChannelEnv(): { failedAttempts: number } {
  return { failedAttempts: parseEnv(mockChannelEnvSchema).MOCK_CHANNEL_FAILED_ATTEMPTS };
}
