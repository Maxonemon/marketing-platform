import { describe, expect, it } from "vitest";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { addTestMember, createTestApproval, createTestBrand, createTestUser, createTestWorkspace } from "@/test/fixtures";
import { listActivity } from "./activity-log";
import { approve } from "./approvals";
import { listBrands } from "./brands";
import {
  acceptInvitations,
  changeRole,
  inviteMember,
  LAST_OWNER,
  listMembers,
  removeMember,
} from "./members";
import { listMyWorkspaces } from "./workspaces";

// Olivia owns the Workspace, Adam is an Admin and Mia a Member.
async function setUpWorkspace() {
  const owner = await createTestUser("Olivia");
  const workspaceId = await createTestWorkspace(owner, "acme-agency");
  const adam = await createTestUser("Adam");
  await addTestMember(workspaceId, adam, "ADMIN");
  const mia = await createTestUser("Mia");
  await addTestMember(workspaceId, mia, "MEMBER");
  return { owner, adam, mia, workspaceId };
}

// Signs up through Better Auth, as the sign-in page does; signing up also signs in.
async function signUp(email: string, name: string): Promise<{ userId: string }> {
  const response = await auth.api.signUpEmail({ body: { email, password: "a-long-test-password", name } });
  return { userId: response.user.id };
}

describe("inviting", () => {
  it("makes the invited person a member with the invited role at their first sign-in, and logs both", async () => {
    const { adam, workspaceId } = await setUpWorkspace();

    const invited = await inviteMember(adam, workspaceId, { email: "  Nora@Example.test ", role: "ADMIN" });
    const nora = await signUp("nora@example.test", "Nora");

    expect(invited).toMatchObject({ ok: true });
    expect(await listMyWorkspaces(nora)).toEqual([expect.objectContaining({ id: workspaceId, role: "ADMIN" })]);
    expect(await listMembers(nora, workspaceId)).toMatchObject({ ok: true, value: { invitations: [] } });
    expect(await listActivity(nora, workspaceId)).toMatchObject({
      ok: true,
      value: [
        { event: "MEMBER_JOINED", actorName: "Nora", brand: null, details: { email: "nora@example.test", role: "ADMIN" } },
        { event: "MEMBER_INVITED", actorName: "Adam", details: { email: "nora@example.test", role: "ADMIN" } },
      ],
    });
  });

  it("lists the pending invitation until it is consumed, and consumes it once", async () => {
    const { owner, workspaceId } = await setUpWorkspace();
    await inviteMember(owner, workspaceId, { email: "nora@example.test", role: "MEMBER" });
    const pending = await listMembers(owner, workspaceId);
    const nora = await createTestUser("Nora");
    await db.user.update({ where: { id: nora.userId }, data: { email: "nora@example.test" } });

    const first = await acceptInvitations(nora.userId);
    const again = await acceptInvitations(nora.userId);

    expect(pending).toMatchObject({ ok: true, value: { invitations: [{ email: "nora@example.test", role: "MEMBER", invitedBy: "Olivia" }] } });
    expect(first).toBe(1);
    expect(again).toBe(0);
    expect(await listMyWorkspaces(nora)).toEqual([expect.objectContaining({ id: workspaceId, role: "MEMBER" })]);
  });

  it("refuses a Member who tries to invite", async () => {
    const { mia, workspaceId } = await setUpWorkspace();

    const result = await inviteMember(mia, workspaceId, { email: "nora@example.test", role: "MEMBER" });

    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await listMembers(mia, workspaceId)).toMatchObject({ ok: true, value: { invitations: [] } });
  });

  it("refuses inviting an Owner, a bad email, an existing member and a second invitation of the same email", async () => {
    const { owner, workspaceId } = await setUpWorkspace();
    const member = await db.user.findUniqueOrThrow({ where: { id: (await createTestUser("Max")).userId } });
    await addTestMember(workspaceId, { userId: member.id }, "MEMBER");
    await inviteMember(owner, workspaceId, { email: "nora@example.test", role: "MEMBER" });

    const asOwner = await inviteMember(owner, workspaceId, { email: "olga@example.test", role: "OWNER" });
    const badEmail = await inviteMember(owner, workspaceId, { email: "not-an-email", role: "MEMBER" });
    const existing = await inviteMember(owner, workspaceId, { email: member.email.toUpperCase(), role: "ADMIN" });
    const twice = await inviteMember(owner, workspaceId, { email: "NORA@example.test", role: "ADMIN" });

    expect(asOwner).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", fieldErrors: { role: [expect.any(String)] } } });
    expect(badEmail).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", fieldErrors: { email: [expect.any(String)] } } });
    expect(existing).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(twice).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });
});

describe("changing roles and removing members", () => {
  it("lets an Owner change a role, and logs it", async () => {
    const { owner, mia, workspaceId } = await setUpWorkspace();

    const changed = await changeRole(owner, workspaceId, mia.userId, { role: "ADMIN" });

    expect(changed).toEqual({ ok: true, value: undefined });
    expect(await listMembers(owner, workspaceId)).toMatchObject({
      ok: true,
      value: { members: expect.arrayContaining([expect.objectContaining({ userId: mia.userId, role: "ADMIN" })]) },
    });
    expect(await listActivity(owner, workspaceId)).toMatchObject({
      ok: true,
      value: [{ event: "MEMBER_ROLE_CHANGED", actorName: "Olivia", details: { name: "Mia", from: "MEMBER", to: "ADMIN" } }],
    });
  });

  it("refuses an Admin who tries to change a role or remove a member", async () => {
    const { adam, mia, workspaceId } = await setUpWorkspace();

    const changed = await changeRole(adam, workspaceId, mia.userId, { role: "ADMIN" });
    const removed = await removeMember(adam, workspaceId, mia.userId);

    expect(changed).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(removed).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("never demotes or removes the last Owner", async () => {
    const { owner, workspaceId } = await setUpWorkspace();

    const demoted = await changeRole(owner, workspaceId, owner.userId, { role: "ADMIN" });
    const removed = await removeMember(owner, workspaceId, owner.userId);

    expect(demoted).toEqual({ ok: false, error: { code: "CONFLICT", message: LAST_OWNER } });
    expect(removed).toEqual({ ok: false, error: { code: "CONFLICT", message: LAST_OWNER } });
    expect(await listMyWorkspaces(owner)).toEqual([expect.objectContaining({ id: workspaceId, role: "OWNER" })]);
  });

  // Each demotes the other at the same moment: one must be refused.
  it("keeps an Owner when two Owners demote each other at the same moment", async () => {
    const { owner, adam, workspaceId } = await setUpWorkspace();
    await changeRole(owner, workspaceId, adam.userId, { role: "OWNER" });

    const results = await Promise.all([
      changeRole(owner, workspaceId, adam.userId, { role: "MEMBER" }),
      changeRole(adam, workspaceId, owner.userId, { role: "MEMBER" }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const owners = await db.workspaceMember.count({ where: { workspaceId, role: "OWNER" } });
    expect(owners).toBe(1);
  });

  it("lets an Owner demote another Owner, or themselves while another Owner remains", async () => {
    const { owner, adam, workspaceId } = await setUpWorkspace();
    await changeRole(owner, workspaceId, adam.userId, { role: "OWNER" });

    const demoted = await changeRole(owner, workspaceId, owner.userId, { role: "ADMIN" });

    expect(demoted).toEqual({ ok: true, value: undefined });
  });

  it("cuts a removed member off at once: their next operation, even on an undecided Approval, is not found", async () => {
    const { owner, adam, mia, workspaceId } = await setUpWorkspace();
    const brandId = await createTestBrand(owner, workspaceId, { name: "Northwind Coffee" });
    const approvalId = await createTestApproval(mia, workspaceId, brandId, "Our autumn blend lands Monday.");

    const removed = await removeMember(owner, workspaceId, adam.userId);
    const approved = await approve(adam, workspaceId, approvalId, async () => {});

    expect(removed).toEqual({ ok: true, value: undefined });
    expect(approved).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await listMyWorkspaces(adam)).toEqual([]);
    expect(await listActivity(owner, workspaceId)).toMatchObject({
      ok: true,
      value: [{ event: "MEMBER_REMOVED", actorName: "Olivia", details: { name: "Adam", role: "ADMIN" } }, {}, {}],
    });
  });

  it("reports a member of another Workspace as not found", async () => {
    const { owner, workspaceId } = await setUpWorkspace();
    const outsider = await createTestUser("Mallory");
    await createTestWorkspace(outsider, "other-agency");

    const result = await removeMember(owner, workspaceId, outsider.userId);

    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("switching Workspace", () => {
  it("shows a member of two Workspaces only the data of the one they are in", async () => {
    const { owner, mia, workspaceId } = await setUpWorkspace();
    const otherOwner = await createTestUser("Oscar");
    const otherWorkspaceId = await createTestWorkspace(otherOwner, "other-agency");
    await addTestMember(otherWorkspaceId, mia, "MEMBER");
    await createTestBrand(owner, workspaceId, { name: "Northwind Coffee" });
    await createTestBrand(otherOwner, otherWorkspaceId, { name: "Contoso Tea" });

    const here = await listBrands(mia, workspaceId);
    const there = await listBrands(mia, otherWorkspaceId);

    expect(await listMyWorkspaces(mia)).toEqual([
      expect.objectContaining({ id: workspaceId }),
      expect.objectContaining({ id: otherWorkspaceId }),
    ]);
    expect(here).toMatchObject({ ok: true, value: [{ name: "Northwind Coffee" }] });
    expect(there).toMatchObject({ ok: true, value: [{ name: "Contoso Tea" }] });
  });
});
