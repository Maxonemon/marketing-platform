import { describe, expect, it } from "vitest";
import { createFakeAiProvider } from "@/lib/ai/fake-provider";
import { AUDIENCE_MAX_LENGTH } from "@/lib/limits";
import { addTestMember, createTestBrand, createTestReview, createTestUser, createTestWorkspace } from "@/test/fixtures";
import { getApproval } from "./approvals";
import { requestContent, runContentTask } from "./content-requests";
import { editVariant, getReview, submitReview } from "./reviews";

const POST_TEXT = "Our autumn blend lands Monday: cocoa, cherry and a long, warm finish.";
const EDITED_TEXT = "Our autumn blend lands Monday: cocoa, cherry and a warm finish. Free shipping all week.";

// Olivia owns the Workspace and Mia is a Member. The Brand prohibits "free".
async function setUpWorkspace() {
  const owner = await createTestUser("Olivia");
  const workspaceId = await createTestWorkspace(owner, "acme-agency");
  const mia = await createTestUser("Mia");
  await addTestMember(workspaceId, mia, "MEMBER");
  const brandId = await createTestBrand(owner, workspaceId, { name: "Northwind Coffee", prohibitedPhrases: ["free"] });
  return { owner, mia, workspaceId, brandId };
}

describe("editing a Variant in the Review", () => {
  it("changes the Variant and checks the edited text against the Brand rules again", async () => {
    const { mia, workspaceId, brandId } = await setUpWorkspace();
    const { taskId, variantId } = await createTestReview(mia, workspaceId, brandId, POST_TEXT);

    const edited = await editVariant(mia, workspaceId, taskId, variantId, { body: EDITED_TEXT });

    expect(edited).toMatchObject({ ok: true });
    const review = await getReview(mia, workspaceId, taskId);
    expect(review).toMatchObject({
      ok: true,
      value: { variants: [{ id: variantId, body: EDITED_TEXT, violations: [{ kind: "PROHIBITED_PHRASE", phrase: "free" }] }, {}, {}] },
    });
  });

  it("clears a warning when the edit removes the prohibited phrase", async () => {
    const { mia, workspaceId, brandId } = await setUpWorkspace();
    const { taskId, variantId } = await createTestReview(mia, workspaceId, brandId, EDITED_TEXT);

    await editVariant(mia, workspaceId, taskId, variantId, { body: POST_TEXT });

    expect(await getReview(mia, workspaceId, taskId)).toMatchObject({
      ok: true,
      value: { variants: [{ id: variantId, body: POST_TEXT, violations: [] }, {}, {}] },
    });
  });

  it("is what submitting proposes, with the audience set at submit", async () => {
    const { mia, workspaceId, brandId } = await setUpWorkspace();
    const { taskId, variantId } = await createTestReview(mia, workspaceId, brandId, POST_TEXT);
    await editVariant(mia, workspaceId, taskId, variantId, { body: EDITED_TEXT });

    const submitted = await submitReview(mia, workspaceId, taskId, {
      contentAssetId: variantId,
      audience: "  Newsletter subscribers in Lyon ",
    });

    if (!submitted.ok) throw new Error("expected the submit to succeed");
    expect(await getApproval(mia, workspaceId, submitted.value.id)).toMatchObject({
      ok: true,
      value: {
        proposedAction: { payload: { content: { body: EDITED_TEXT }, audience: "Newsletter subscribers in Lyon" } },
        contentAsset: { violations: [{ kind: "PROHIBITED_PHRASE", phrase: "free" }] },
      },
    });
  });

  it("keeps the subject line of an Email, which is required", async () => {
    const { mia, workspaceId, brandId } = await setUpWorkspace();
    const request = { contentType: "EMAIL", channel: "MOCK", brief: "Welcome new subscribers." };
    const requested = await requestContent(mia, workspaceId, brandId, request, async () => {});
    if (!requested.ok) throw new Error("expected the request to succeed");
    const taskId = requested.value.id;
    const email = (n: number) => ({ subject: `Welcome ${n}`, body: `Thanks for joining us (${n}).` });
    await runContentTask(taskId, createFakeAiProvider(() => ({ variants: [email(1), email(2), email(3)] })));
    const review = await getReview(mia, workspaceId, taskId);
    const variantId = review.ok ? (review.value.variants[0]?.id ?? "") : "";

    const withoutSubject = await editVariant(mia, workspaceId, taskId, variantId, { subject: " ", body: "Hello." });
    const edited = await editVariant(mia, workspaceId, taskId, variantId, { subject: "Hello there", body: "Hello." });

    expect(withoutSubject).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", fieldErrors: { subject: [expect.any(String)] } } });
    expect(edited).toMatchObject({ ok: true });
    expect(await getReview(mia, workspaceId, taskId)).toMatchObject({
      ok: true,
      value: { variants: [{ id: variantId, subject: "Hello there", body: "Hello." }, {}, {}] },
    });
  });

  it("refuses an empty body and leaves the Variant unchanged", async () => {
    const { mia, workspaceId, brandId } = await setUpWorkspace();
    const { taskId, variantId } = await createTestReview(mia, workspaceId, brandId, POST_TEXT);

    const result = await editVariant(mia, workspaceId, taskId, variantId, { body: "   " });

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", fieldErrors: { body: [expect.any(String)] } } });
    expect(await getReview(mia, workspaceId, taskId)).toMatchObject({ ok: true, value: { variants: [{ body: POST_TEXT }, {}, {}] } });
  });

  it("is refused once the Review is submitted: the Proposed Action keeps what was submitted", async () => {
    const { mia, workspaceId, brandId } = await setUpWorkspace();
    const { taskId, variantId } = await createTestReview(mia, workspaceId, brandId, POST_TEXT);
    const submitted = await submitReview(mia, workspaceId, taskId, { contentAssetId: variantId });
    if (!submitted.ok) throw new Error("expected the submit to succeed");

    const result = await editVariant(mia, workspaceId, taskId, variantId, { body: EDITED_TEXT });

    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await getApproval(mia, workspaceId, submitted.value.id)).toMatchObject({
      ok: true,
      value: { proposedAction: { payload: { content: { body: POST_TEXT } } }, contentAsset: { body: POST_TEXT } },
    });
  });

  it("is refused for a Variant of another Review", async () => {
    const { mia, workspaceId, brandId } = await setUpWorkspace();
    const { taskId } = await createTestReview(mia, workspaceId, brandId, POST_TEXT);
    const other = await createTestReview(mia, workspaceId, brandId, "Another post.");

    const result = await editVariant(mia, workspaceId, taskId, other.variantId, { body: EDITED_TEXT });

    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await getReview(mia, workspaceId, other.taskId)).toMatchObject({
      ok: true,
      value: { variants: [{ body: "Another post." }, {}, {}] },
    });
  });

  it("is refused to someone outside the Workspace, and changes nothing", async () => {
    const { mia, workspaceId, brandId } = await setUpWorkspace();
    const { taskId, variantId } = await createTestReview(mia, workspaceId, brandId, POST_TEXT);
    const outsider = await createTestUser("Oscar");
    await createTestWorkspace(outsider, "other-agency");

    const result = await editVariant(outsider, workspaceId, taskId, variantId, { body: EDITED_TEXT });

    expect(result).toMatchObject({ ok: false });
    expect(await getReview(mia, workspaceId, taskId)).toMatchObject({ ok: true, value: { variants: [{ body: POST_TEXT }, {}, {}] } });
  });
});

describe("the audience set at submit", () => {
  it("is refused when longer than the limit, and the Review stays open", async () => {
    const { mia, workspaceId, brandId } = await setUpWorkspace();
    const { taskId, variantId } = await createTestReview(mia, workspaceId, brandId, POST_TEXT);

    const result = await submitReview(mia, workspaceId, taskId, { contentAssetId: variantId, audience: "x".repeat(AUDIENCE_MAX_LENGTH + 1) });

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", fieldErrors: { audience: [expect.any(String)] } } });
    expect(await getReview(mia, workspaceId, taskId)).toMatchObject({ ok: true });
  });
});
