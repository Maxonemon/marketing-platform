import { afterEach, describe, expect, it, vi } from "vitest";
import { authEnv, dbEnv } from "./env";

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
});
