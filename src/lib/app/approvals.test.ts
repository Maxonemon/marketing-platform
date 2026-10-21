import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addTestMember, createTestApproval, createTestBrand, createTestReview, createTestUser, createTestWorkspace } from "@/test/fixtures";
import { listActivity } from "./activity-log";
import { approve, getApproval, type StartExecution } from "./approvals";
import { getReview, submitReview } from "./reviews";
import { getTask } from "./tasks";

const POST_TEXT = "Our autumn blend lands Monday: cocoa, cherry and a long, warm finish.";

// Written out by hand: what submitting POST_TEXT on the mock Channel must propose.
const EXPECTED_PAYLOAD = {
  channel: "MOCK",
  contentType: "SOCIAL_POST",
  content: { body: POST_TEXT },
  audience: null,
  timing: { kind: "AS_SOON_AS_APPROVED" },
};
// SHA-256 of EXPECTED_PAYLOAD's canonical serialization, worked out with sha256sum.
const EXPECTED_HASH = "b3ce605b898eaf2c63167bdf99b30c20e8d433dd8372672159131842290bd87d";

// Stands in for Inngest: records which Approvals the approve asked to execute.
function recordingStartExecution(): { startExecution: StartExecution; startedApprovalIds: string[] } {
  const startedApprovalIds: string[] = [];
  return {
    startedApprovalIds,
    startExecution: async (approvalId) => {
      startedApprovalIds.push(approvalId);
    },
  };
}

// Olivia owns the Workspace, Adam is an Admin and Mia a Member.
async function setUpWorkspace() {
  const owner = await createTestUser("Olivia");
  const workspaceId = await createTestWorkspace(owner, "acme-agency");
  const adam = await createTestUser("Adam");
  await addTestMember(workspaceId, adam, "ADMIN");
  const mia = await createTestUser("Mia");
  await addTestMember(workspaceId, mia, "MEMBER");
  const brandId = await createTestBrand(owner, workspaceId, { name: "Northwind Coffee" });
  return { owner, adam, mia, workspaceId, brandId };
}

describe("submitting a Review", () => {
  it("proposes exactly the picked Variant as a Pending Approval and completes the Task", async () => {
    const { owner, mia, workspaceId, brandId } = await setUpWorkspace();
    const { taskId, variantId } = await createTestReview(mia, workspaceId, brandId, POST_TEXT);

    const submitted = await submitReview(mia, workspaceId, taskId, { contentAssetId: variantId });

    if (!submitted.ok) throw new Error("expected the submit to succeed");
    const approvalId = submitted.value.id;
    expect(await getApproval(owner, workspaceId, approvalId)).toMatchObject({
      ok: true,
      value: {
        status: "PENDING",
        decidedBy: null,
        decidedAt: null,
        proposedAction: { payload: EXPECTED_PAYLOAD, payloadHash: EXPECTED_HASH, createdBy: "Mia" },
        contentAsset: { id: variantId, variant: 1, body: POST_TEXT },
        task: { id: taskId, brand: { id: brandId, name: "Northwind Coffee" } },
        executions: [],
      },
    });
    expect(await getTask(mia, workspaceId, taskId)).toMatchObject({ ok: true, value: { status: "COMPLETED" } });
    expect(await getReview(mia, workspaceId, taskId)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await listActivity(owner, workspaceId)).toMatchObject({
      ok: true,
      value: [
        { event: "PROPOSED_ACTION_SUBMITTED", actorName: "Mia", taskId, approvalId, details: { payloadHash: EXPECTED_HASH } },
        { event: "BRAND_CREATED" },
      ],
    });
  });

  it("happens once: a second submit finds no Review", async () => {
    const { mia, workspaceId, brandId } = await setUpWorkspace();
    const { taskId, variantId } = await createTestReview(mia, workspaceId, brandId, POST_TEXT);
    await submitReview(mia, workspaceId, taskId, { contentAssetId: variantId });

    const again = await submitReview(mia, workspaceId, taskId, { contentAssetId: variantId });

    expect(again).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("refuses a Variant that isn't one of the Review's, and leaves the Review open", async () => {
    const { mia, workspaceId, brandId } = await setUpWorkspace();
    const { taskId } = await createTestReview(mia, workspaceId, brandId, POST_TEXT);
    const other = await createTestReview(mia, workspaceId, brandId, "Another post.");

    const result = await submitReview(mia, workspaceId, taskId, { contentAssetId: other.variantId });

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", fieldErrors: { contentAssetId: [expect.any(String)] } } });
    expect(await getTask(mia, workspaceId, taskId)).toMatchObject({ ok: true, value: { status: "IN_REVIEW" } });
  });
});

describe("approving", () => {
  it("is allowed to the Owner: the Approval is APPROVED, logged, and its Execution is started", async () => {
    const { owner, mia, workspaceId, brandId } = await setUpWorkspace();
    const approvalId = await createTestApproval(mia, workspaceId, brandId, POST_TEXT);
    const { startExecution, startedApprovalIds } = recordingStartExecution();

    const result = await approve(owner, workspaceId, approvalId, startExecution);

    expect(result).toMatchObject({ ok: true });
    expect(startedApprovalIds).toEqual([approvalId]);
    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({
      ok: true,
      value: { status: "APPROVED", decidedBy: "Olivia", decidedAt: expect.any(Date), executions: [] },
    });
    expect(await listActivity(mia, workspaceId)).toMatchObject({
      ok: true,
      value: [
        { event: "APPROVAL_APPROVED", actorName: "Olivia", brand: { id: brandId }, approvalId, details: { payloadHash: EXPECTED_HASH } },
        { event: "PROPOSED_ACTION_SUBMITTED" },
        { event: "BRAND_CREATED" },
      ],
    });
  });

  it("lets an Admin approve a Proposed Action they submitted themselves", async () => {
    const { adam, workspaceId, brandId } = await setUpWorkspace();
    const approvalId = await createTestApproval(adam, workspaceId, brandId, POST_TEXT);
    const { startExecution, startedApprovalIds } = recordingStartExecution();

    const result = await approve(adam, workspaceId, approvalId, startExecution);

    expect(result).toMatchObject({ ok: true });
    expect(startedApprovalIds).toEqual([approvalId]);
    expect(await getApproval(adam, workspaceId, approvalId)).toMatchObject({
      ok: true,
      value: { status: "APPROVED", decidedBy: "Adam" },
    });
  });

  it("is refused to a Member, even for their own Proposed Action, and starts nothing", async () => {
    const { mia, workspaceId, brandId } = await setUpWorkspace();
    const approvalId = await createTestApproval(mia, workspaceId, brandId, POST_TEXT);
    const { startExecution, startedApprovalIds } = recordingStartExecution();

    const result = await approve(mia, workspaceId, approvalId, startExecution);

    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(startedApprovalIds).toEqual([]);
    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({ ok: true, value: { status: "PENDING" } });
  });

  it("happens once: approving an Approval that is no longer Pending is refused", async () => {
    const { owner, adam, workspaceId, brandId } = await setUpWorkspace();
    const approvalId = await createTestApproval(owner, workspaceId, brandId, POST_TEXT);
    const { startExecution, startedApprovalIds } = recordingStartExecution();
    await approve(owner, workspaceId, approvalId, startExecution);

    const again = await approve(adam, workspaceId, approvalId, startExecution);

    expect(again).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(startedApprovalIds).toEqual([approvalId]);
    expect(await getApproval(adam, workspaceId, approvalId)).toMatchObject({ ok: true, value: { decidedBy: "Olivia" } });
  });

  // No code updates a Proposed Action, so the test changes the stored row directly.
  it("is refused when the stored payload no longer matches its hash", async () => {
    const { owner, mia, workspaceId, brandId } = await setUpWorkspace();
    const approvalId = await createTestApproval(mia, workspaceId, brandId, POST_TEXT);
    const approval = await getApproval(owner, workspaceId, approvalId);
    if (!approval.ok) throw new Error("expected the Approval");
    const tampered = { ...EXPECTED_PAYLOAD, content: { body: "Everything is free today!" } };
    await db.proposedAction.update({ where: { id: approval.value.proposedAction.id }, data: { payload: tampered } });
    const { startExecution, startedApprovalIds } = recordingStartExecution();

    const result = await approve(owner, workspaceId, approvalId, startExecution);

    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(startedApprovalIds).toEqual([]);
    expect(await getApproval(owner, workspaceId, approvalId)).toMatchObject({
      ok: true,
      value: { status: "PENDING", proposedAction: { payload: null } },
    });
  });
});

describe("another Workspace's Approvals", () => {
  it("can't be submitted, read or approved: each is not found, and nothing changes", async () => {
    const { mia, workspaceId, brandId } = await setUpWorkspace();
    const { taskId, variantId } = await createTestReview(mia, workspaceId, brandId, POST_TEXT);
    const approvalId = await createTestApproval(mia, workspaceId, brandId, POST_TEXT);
    const outsider = await createTestUser("Oscar");
    const outsiderWorkspaceId = await createTestWorkspace(outsider, "other-agency");
    const { startExecution, startedApprovalIds } = recordingStartExecution();

    for (const targetWorkspaceId of [workspaceId, outsiderWorkspaceId]) {
      const notFound = { ok: false, error: { code: "NOT_FOUND" } };
      expect(await submitReview(outsider, targetWorkspaceId, taskId, { contentAssetId: variantId })).toMatchObject(notFound);
      expect(await getApproval(outsider, targetWorkspaceId, approvalId)).toMatchObject(notFound);
      expect(await approve(outsider, targetWorkspaceId, approvalId, startExecution)).toMatchObject(notFound);
    }
    expect(startedApprovalIds).toEqual([]);
    expect(await getTask(mia, workspaceId, taskId)).toMatchObject({ ok: true, value: { status: "IN_REVIEW" } });
    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({ ok: true, value: { status: "PENDING" } });
  });
});
