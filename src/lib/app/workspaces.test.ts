import { describe, expect, it } from "vitest";
import { createTestUser } from "@/test/fixtures";
import { createWorkspace, getWorkspace, getWorkspaceBySlug, listMyWorkspaces } from "./workspaces";

describe("createWorkspace", () => {
  it("makes the caller the Owner of the new Workspace", async () => {
    const alice = await createTestUser("Alice");

    const result = await createWorkspace(alice, { name: "Acme Agency", slug: "acme-agency" });

    expect(result).toMatchObject({ ok: true, value: { name: "Acme Agency", slug: "acme-agency", role: "OWNER" } });
    expect(await listMyWorkspaces(alice)).toEqual([
      expect.objectContaining({ name: "Acme Agency", slug: "acme-agency", role: "OWNER" }),
    ]);
  });

  it("rejects a slug that is already taken", async () => {
    const alice = await createTestUser("Alice");
    const bob = await createTestUser("Bob");
    await createWorkspace(alice, { name: "Acme Agency", slug: "acme" });

    const result = await createWorkspace(bob, { name: "Another Acme", slug: "acme" });

    expect(result).toEqual({
      ok: false,
      error: { code: "CONFLICT", message: "That slug is already taken.", fieldErrors: { slug: ["That slug is already taken."] } },
    });
    expect(await listMyWorkspaces(bob)).toEqual([]);
  });

  it("rejects an invalid name and slug with a message for each field", async () => {
    const alice = await createTestUser("Alice");

    const result = await createWorkspace(alice, { name: "   ", slug: "Not A Slug!" });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT", fieldErrors: { name: [expect.any(String)], slug: [expect.any(String)] } },
    });
    expect(await listMyWorkspaces(alice)).toEqual([]);
  });

  it.each(["ab", "-acme", "acme-", "acme--agency", "a".repeat(49)])("rejects the slug %j", async (slug) => {
    const alice = await createTestUser("Alice");

    const result = await createWorkspace(alice, { name: "Acme", slug });

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", fieldErrors: { slug: [expect.any(String)] } } });
  });
});

describe("reading a Workspace", () => {
  it("returns the Workspace to its members", async () => {
    const alice = await createTestUser("Alice");
    const created = await createWorkspace(alice, { name: "Acme Agency", slug: "acme-agency" });
    if (!created.ok) throw new Error("setup failed");

    expect(await getWorkspace(alice, created.value.id)).toMatchObject({ ok: true, value: { slug: "acme-agency" } });
    expect(await getWorkspaceBySlug(alice, "acme-agency")).toMatchObject({ ok: true, value: { id: created.value.id } });
  });

  it("reports another user's Workspace as not found, never forbidden", async () => {
    const alice = await createTestUser("Alice");
    const mallory = await createTestUser("Mallory");
    const created = await createWorkspace(alice, { name: "Acme Agency", slug: "acme-agency" });
    if (!created.ok) throw new Error("setup failed");

    const byId = await getWorkspace(mallory, created.value.id);
    const bySlug = await getWorkspaceBySlug(mallory, "acme-agency");
    const missing = await getWorkspace(mallory, "does-not-exist");

    expect(byId).toEqual(missing);
    expect(bySlug).toEqual(missing);
    expect(missing).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await listMyWorkspaces(mallory)).toEqual([]);
  });
});
