import { describe, expect, it } from "vitest";
import { assertSeparateTestDatabase, isSameDatabase } from "./database-guard";

const DIRECT = "postgresql://app:pw@ep-cool-river-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require";

describe("isSameDatabase", () => {
  it.each([
    ["identical URLs", DIRECT],
    ["different query options", "postgresql://app:pw@ep-cool-river-123456.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full&channel_binding=require"],
    ["Neon pooled host", "postgresql://app:pw@ep-cool-river-123456-pooler.eu-central-1.aws.neon.tech/neondb"],
    ["other credentials and explicit default port", "postgres://other:secret@EP-COOL-RIVER-123456.eu-central-1.aws.neon.tech:5432/neondb"],
  ])("treats %s as the same database", (_label, other) => {
    expect(isSameDatabase(DIRECT, other)).toBe(true);
  });

  it.each([
    ["another Neon branch", "postgresql://app:pw@ep-quiet-lake-654321.eu-central-1.aws.neon.tech/neondb"],
    ["another database name", "postgresql://app:pw@ep-cool-river-123456.eu-central-1.aws.neon.tech/neondb_test"],
    ["another port", "postgresql://app:pw@ep-cool-river-123456.eu-central-1.aws.neon.tech:6543/neondb"],
  ])("treats %s as a different database", (_label, other) => {
    expect(isSameDatabase(DIRECT, other)).toBe(false);
  });

  it("treats an unparseable URL as the same database, so the guard fails closed", () => {
    expect(isSameDatabase(DIRECT, "not a url")).toBe(true);
  });
});

describe("isSameDatabase edge cases", () => {
  it("ignores the case of a Neon -POOLER suffix", () => {
    expect(isSameDatabase(DIRECT, "postgresql://app:pw@EP-COOL-RIVER-123456-POOLER.eu-central-1.aws.neon.tech/neondb")).toBe(true);
  });

  it("treats a pooled host with another database name as a different database", () => {
    expect(isSameDatabase(DIRECT, "postgresql://app:pw@ep-cool-river-123456-pooler.eu-central-1.aws.neon.tech/other")).toBe(false);
  });

  it("fails closed when the test URL itself is unparseable", () => {
    expect(isSameDatabase("not a url", DIRECT)).toBe(true);
  });
});

describe("assertSeparateTestDatabase", () => {
  const TEST = "postgresql://app:pw@ep-quiet-lake-654321.eu-central-1.aws.neon.tech/neondb";

  it("refuses to run without a test database URL", () => {
    expect(() => assertSeparateTestDatabase(undefined, [DIRECT])).toThrow(/TEST_DATABASE_URL is not set/);
    expect(() => assertSeparateTestDatabase("", [DIRECT])).toThrow(/TEST_DATABASE_URL is not set/);
  });

  it("refuses when any non-test URL points at the test database", () => {
    const pooledAliasOfTest = "postgresql://app:pw@ep-quiet-lake-654321-pooler.eu-central-1.aws.neon.tech/neondb";

    expect(() => assertSeparateTestDatabase(TEST, [undefined, DIRECT, pooledAliasOfTest])).toThrow(/same database/);
  });

  it("returns the test URL when every non-test URL is another database or unset", () => {
    expect(assertSeparateTestDatabase(TEST, [undefined, "", DIRECT])).toBe(TEST);
  });
});
