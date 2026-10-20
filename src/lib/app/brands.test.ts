import { describe, expect, it } from "vitest";
import { BRAND_VOICE_MAX_LENGTH } from "@/lib/limits";
import { addTestMember, createTestUser, createTestWorkspace } from "@/test/fixtures";
import { listActivity } from "./activity-log";
import { createBrand, getBrand, listBrands } from "./brands";

const NORTHWIND = {
  name: "Northwind Coffee",
  websiteUrl: "https://northwind.example",
  industry: "Coffee roasting",
  audience: "Remote workers who buy beans online",
  voice: "Warm and plain-spoken. No jargon.",
};

describe("createBrand", () => {
  it("lets any member create a Brand and logs who created it", async () => {
    const owner = await createTestUser("Olivia");
    const workspaceId = await createTestWorkspace(owner, "acme-agency");
    const mia = await createTestUser("Mia");
    await addTestMember(workspaceId, mia, "MEMBER");

    const created = await createBrand(mia, workspaceId, NORTHWIND);

    if (!created.ok) throw new Error("expected the Brand to be created");
    const brandId = created.value.id;
    expect(await getBrand(owner, workspaceId, brandId)).toMatchObject({ ok: true, value: NORTHWIND });
    expect(await listBrands(owner, workspaceId)).toMatchObject({ ok: true, value: [{ id: brandId, name: "Northwind Coffee" }] });
    expect(await listActivity(owner, workspaceId)).toMatchObject({
      ok: true,
      value: [
        {
          event: "BRAND_CREATED",
          actorName: "Mia",
          brand: { id: brandId, name: "Northwind Coffee" },
          details: { name: "Northwind Coffee" },
        },
      ],
    });
  });

  it("refuses invalid settings with a message for each field, and creates and logs nothing", async () => {
    const owner = await createTestUser("Olivia");
    const workspaceId = await createTestWorkspace(owner, "acme-agency");

    const result = await createBrand(owner, workspaceId, {
      name: "   ",
      websiteUrl: "northwind dot example",
      voice: "x".repeat(BRAND_VOICE_MAX_LENGTH + 1),
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "INVALID_INPUT",
        fieldErrors: { name: [expect.any(String)], websiteUrl: [expect.any(String)], voice: [expect.any(String)] },
      },
    });
    expect(await listBrands(owner, workspaceId)).toEqual({ ok: true, value: [] });
    expect(await listActivity(owner, workspaceId)).toEqual({ ok: true, value: [] });
  });

  // A website is shown as a link, so only full http(s) addresses on a real domain pass.
  it.each(["northwind.example", "ftp://northwind.example", "javascript:alert(1)", "https://localhost"])(
    "refuses the website %j",
    async (websiteUrl) => {
      const owner = await createTestUser("Olivia");
      const workspaceId = await createTestWorkspace(owner, "acme-agency");

      const result = await createBrand(owner, workspaceId, { name: "Northwind Coffee", websiteUrl });

      expect(result).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", fieldErrors: { websiteUrl: [expect.any(String)] } } });
    },
  );

  it("trims the settings and stores blank optional fields as empty", async () => {
    const owner = await createTestUser("Olivia");
    const workspaceId = await createTestWorkspace(owner, "acme-agency");

    const created = await createBrand(owner, workspaceId, { name: "  Northwind Coffee  ", websiteUrl: "", industry: "   " });

    expect(created).toMatchObject({
      ok: true,
      value: { name: "Northwind Coffee", websiteUrl: null, industry: null, audience: null, voice: null },
    });
  });
});

describe("a Brand in another Workspace", () => {
  it("is not found for a member of another Workspace, the same as a missing Brand", async () => {
    const alice = await createTestUser("Alice");
    const aliceWorkspace = await createTestWorkspace(alice, "alice-agency");
    const created = await createBrand(alice, aliceWorkspace, NORTHWIND);
    if (!created.ok) throw new Error("setup failed");
    const mallory = await createTestUser("Mallory");
    const malloryWorkspace = await createTestWorkspace(mallory, "mallory-agency");

    const missing = await getBrand(mallory, malloryWorkspace, "no-such-brand");

    expect(missing).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await getBrand(mallory, malloryWorkspace, created.value.id)).toEqual(missing);
    expect(await getBrand(mallory, aliceWorkspace, created.value.id)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await listBrands(mallory, aliceWorkspace)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await createBrand(mallory, aliceWorkspace, { name: "Planted" })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await listBrands(mallory, malloryWorkspace)).toEqual({ ok: true, value: [] });
    expect(await listBrands(alice, aliceWorkspace)).toMatchObject({ ok: true, value: [{ name: "Northwind Coffee" }] });
  });
});
