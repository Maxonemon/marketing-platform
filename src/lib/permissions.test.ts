import { describe, expect, it } from "vitest";
import { createWorkspace } from "@/lib/app/workspaces";
import { addTestMember, createTestUser } from "@/test/fixtures";
import { requireRole } from "./permissions";

async function workspaceOwnedBy(name: string): Promise<{ workspaceId: string }> {
  const owner = await createTestUser(name);
  const created = await createWorkspace(owner, { name: `${name}'s Workspace`, slug: `${name.toLowerCase()}-ws` });
  if (!created.ok) throw new Error("setup failed");
  return { workspaceId: created.value.id };
}

describe("requireRole", () => {
  it("lets a member through when their role is at least the required role", async () => {
    const { workspaceId } = await workspaceOwnedBy("Alice");
    const admin = await createTestUser("Adam");
    await addTestMember(workspaceId, admin, "ADMIN");

    expect(await requireRole(admin, workspaceId, "MEMBER")).toMatchObject({ ok: true, value: { role: "ADMIN" } });
    expect(await requireRole(admin, workspaceId, "ADMIN")).toMatchObject({ ok: true, value: { role: "ADMIN" } });
  });

  it("refuses a member below the required role as forbidden", async () => {
    const { workspaceId } = await workspaceOwnedBy("Alice");
    const member = await createTestUser("Mia");
    const admin = await createTestUser("Adam");
    await addTestMember(workspaceId, member, "MEMBER");
    await addTestMember(workspaceId, admin, "ADMIN");

    expect(await requireRole(member, workspaceId, "ADMIN")).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await requireRole(admin, workspaceId, "OWNER")).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("refuses a non-member as not found, the same as a missing Workspace", async () => {
    const { workspaceId } = await workspaceOwnedBy("Alice");
    const outsider = await createTestUser("Mallory");

    const result = await requireRole(outsider, workspaceId, "MEMBER");

    expect(result).toEqual(await requireRole(outsider, "missing-workspace", "MEMBER"));
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});
