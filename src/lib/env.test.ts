import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { aiEnv, authEnv, credentialsEnv, dbEnv, inngestEnv } from "./env";

const SECRET = "s".repeat(32);

describe("env checks", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts a full auth URL and a postgres URL", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", SECRET);
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    vi.stubEnv("DATABASE_URL", "postgresql://user:pw@host/db");

    expect(authEnv().BETTER_AUTH_URL).toBe("http://localhost:3000");
    expect(dbEnv().DATABASE_URL).toBe("postgresql://user:pw@host/db");
  });

  it("rejects an auth URL without http(s)://", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", SECRET);
    vi.stubEnv("BETTER_AUTH_URL", "localhost:3000");

    expect(() => authEnv()).toThrow("Missing or invalid environment variables: BETTER_AUTH_URL");
  });

  it("names a missing variable without revealing the values of the others", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "too-short-secret-value");
    vi.stubEnv("BETTER_AUTH_URL", "");

    expect(() => authEnv()).toThrow(/^Missing or invalid environment variables: BETTER_AUTH_SECRET, BETTER_AUTH_URL$/);
  });

  it("rejects a database URL that is not postgres", () => {
    vi.stubEnv("DATABASE_URL", "mysql://user:pw@host/db");

    expect(() => dbEnv()).toThrow("Missing or invalid environment variables: DATABASE_URL");
  });

  it("requires both Inngest keys outside dev mode, and none in dev mode", () => {
    vi.stubEnv("INNGEST_EVENT_KEY", "");
    vi.stubEnv("INNGEST_SIGNING_KEY", "");

    expect(() => inngestEnv("cloud")).toThrow(/^Missing or invalid environment variables: INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY$/);
    expect(() => inngestEnv("dev")).not.toThrow();

    vi.stubEnv("INNGEST_EVENT_KEY", "event-key");
    vi.stubEnv("INNGEST_SIGNING_KEY", "signkey-prod-123");

    expect(() => inngestEnv("cloud")).not.toThrow();
  });

  // Dev mode turns off the signature check on /api/inngest.
  it("refuses Inngest dev mode in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() => inngestEnv("dev")).toThrow("Missing or invalid environment variables: INNGEST_DEV");
  });

  it("requires a priced AI model, and the Mistral API key for a Mistral model", () => {
    vi.stubEnv("AI_MODEL", "gpt-unknown");
    vi.stubEnv("MISTRAL_API_KEY", "");

    expect(() => aiEnv()).toThrow(/^Missing or invalid environment variables: AI_MODEL$/);

    vi.stubEnv("AI_MODEL", "mistral-small-2603");

    expect(() => aiEnv()).toThrow(/^Missing or invalid environment variables: MISTRAL_API_KEY$/);

    vi.stubEnv("MISTRAL_API_KEY", "mistral-secret-key");

    expect(aiEnv()).toEqual({ provider: "mistral", model: "mistral-small-2603", mistralApiKey: "mistral-secret-key" });
  });

  it("names a rejected AI setting without revealing the API key", () => {
    vi.stubEnv("AI_MODEL", "not-a-model");
    vi.stubEnv("MISTRAL_API_KEY", "mistral-secret-key");

    expect(() => aiEnv()).toThrow(expect.objectContaining({ message: expect.not.stringContaining("mistral-secret-key") }));
  });

  // The fake model writes placeholders: fine for trying the app locally, never in production.
  it("allows the fake AI model without a key, except in production", () => {
    vi.stubEnv("AI_MODEL", "fake");
    vi.stubEnv("MISTRAL_API_KEY", "");

    expect(aiEnv()).toEqual({ provider: "fake", model: "fake" });

    vi.stubEnv("NODE_ENV", "production");

    expect(() => aiEnv()).toThrow("Missing or invalid environment variables: AI_MODEL");
  });

  it("requires a base64 credential key of exactly 32 bytes, and names it without its value", () => {
    const shortKey = randomBytes(16).toString("base64");
    vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", shortKey);

    expect(() => credentialsEnv()).toThrow(/^Missing or invalid environment variables: CREDENTIALS_ENCRYPTION_KEY$/);

    vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", "");

    expect(() => credentialsEnv()).toThrow(/^Missing or invalid environment variables: CREDENTIALS_ENCRYPTION_KEY$/);

    const key = randomBytes(32);
    vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", key.toString("base64"));

    expect(credentialsEnv().credentialKey.equals(key)).toBe(true);
  });
});
