import { describe, expect, it } from "vitest";
import { createTestBrand, createTestUser, createTestWorkspace } from "@/test/fixtures";
import { listActivity } from "./activity-log";

describe("listActivity", () => {
  it("lists the Workspace's entries newest first", async () => {
    const owner = await createTestUser("Olivia");
    const workspaceId = await createTestWorkspace(owner, "acme-agency");
    await createTestBrand(owner, workspaceId, { name: "Northwind Coffee" });
    await createTestBrand(owner, workspaceId, { name: "Contoso Bikes" });

    const result = await listActivity(owner, workspaceId);

    expect(result).toMatchObject({
      ok: true,
      value: [{ details: { name: "Contoso Bikes" } }, { details: { name: "Northwind Coffee" } }],
    });
  });

  it("shows a Workspace's entries only to its own members", async () => {
    const alice = await createTestUser("Alice");
    const aliceWorkspace = await createTestWorkspace(alice, "alice-agency");
    await createTestBrand(alice, aliceWorkspace, { name: "Northwind Coffee" });
    const mallory = await createTestUser("Mallory");
    const malloryWorkspace = await createTestWorkspace(mallory, "mallory-agency");
    await createTestBrand(mallory, malloryWorkspace, { name: "Contoso Bikes" });

    expect(await listActivity(mallory, aliceWorkspace)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await listActivity(mallory, malloryWorkspace)).toMatchObject({
      ok: true,
      value: [{ actorName: "Mallory", details: { name: "Contoso Bikes" } }],
    });
  });
});
