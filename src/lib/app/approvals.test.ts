import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addTestMember, createTestApproval, createTestBrand, createTestReview, createTestUser, createTestWorkspace } from "@/test/fixtures";
import { listActivity } from "./activity-log";
import { approve, getApproval, listPendingApprovals, reject, resubmit, type StartExecution } from "./approvals";
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

describe("rejecting", () => {
  it("is allowed to an Admin with a comment: the Approval is REJECTED, the author sees the comment, and it is logged", async () => {
    const { adam, mia, workspaceId, brandId } = await setUpWorkspace();
    const approvalId = await createTestApproval(mia, workspaceId, brandId, POST_TEXT);

    const result = await reject(adam, workspaceId, approvalId, { comment: "  Name the roast date, please.  " });

    expect(result).toMatchObject({ ok: true });
    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({
      ok: true,
      value: { status: "REJECTED", decidedBy: "Adam", decidedAt: expect.any(Date), comment: "Name the roast date, please.", executions: [] },
    });
    expect(await listActivity(mia, workspaceId)).toMatchObject({
      ok: true,
      value: [
        {
          event: "APPROVAL_REJECTED",
          actorName: "Adam",
          brand: { id: brandId },
          approvalId,
          details: { payloadHash: EXPECTED_HASH, comment: "Name the roast date, please." },
        },
        { event: "PROPOSED_ACTION_SUBMITTED" },
        { event: "BRAND_CREATED" },
      ],
    });
  });

  it.each(["", "   "])("is refused without a comment (%j), and the Approval stays Pending", async (comment) => {
    const { owner, mia, workspaceId, brandId } = await setUpWorkspace();
    const approvalId = await createTestApproval(mia, workspaceId, brandId, POST_TEXT);

    const result = await reject(owner, workspaceId, approvalId, { comment });

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", fieldErrors: { comment: [expect.any(String)] } } });
    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({ ok: true, value: { status: "PENDING", comment: null } });
  });

  it("is refused to a Member", async () => {
    const { mia, workspaceId, brandId } = await setUpWorkspace();
    const approvalId = await createTestApproval(mia, workspaceId, brandId, POST_TEXT);

    const result = await reject(mia, workspaceId, approvalId, { comment: "Not for me to decide." });

    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({ ok: true, value: { status: "PENDING" } });
  });
});

describe("a decision is made once", () => {
  it("refuses to approve a Rejected Approval, and starts nothing", async () => {
    const { owner, adam, mia, workspaceId, brandId } = await setUpWorkspace();
    const approvalId = await createTestApproval(mia, workspaceId, brandId, POST_TEXT);
    await reject(adam, workspaceId, approvalId, { comment: "Too early to announce." });
    const { startExecution, startedApprovalIds } = recordingStartExecution();

    const result = await approve(owner, workspaceId, approvalId, startExecution);

    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(startedApprovalIds).toEqual([]);
    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({
      ok: true,
      value: { status: "REJECTED", decidedBy: "Adam", comment: "Too early to announce." },
    });
  });

  it("refuses to reject an Approved Approval", async () => {
    const { owner, adam, mia, workspaceId, brandId } = await setUpWorkspace();
    const approvalId = await createTestApproval(mia, workspaceId, brandId, POST_TEXT);
    await approve(owner, workspaceId, approvalId, recordingStartExecution().startExecution);

    const result = await reject(adam, workspaceId, approvalId, { comment: "Wait, not yet." });

    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({
      ok: true,
      value: { status: "APPROVED", decidedBy: "Olivia", comment: null },
    });
  });

  it("refuses to reject a Rejected Approval again", async () => {
    const { owner, adam, mia, workspaceId, brandId } = await setUpWorkspace();
    const approvalId = await createTestApproval(mia, workspaceId, brandId, POST_TEXT);
    await reject(adam, workspaceId, approvalId, { comment: "Too early to announce." });

    const result = await reject(owner, workspaceId, approvalId, { comment: "And off-voice." });

    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({
      ok: true,
      value: { decidedBy: "Adam", comment: "Too early to announce." },
    });
  });

  it("gives exactly one decision when two Approvers approve and reject at the same moment", async () => {
    const { owner, adam, mia, workspaceId, brandId } = await setUpWorkspace();
    const approvalId = await createTestApproval(mia, workspaceId, brandId, POST_TEXT);
    const { startExecution, startedApprovalIds } = recordingStartExecution();

    const [approved, rejected] = await Promise.all([
      approve(owner, workspaceId, approvalId, startExecution),
      reject(adam, workspaceId, approvalId, { comment: "Off-voice." }),
    ]);

    const outcomes = [approved, rejected];
    expect(outcomes.filter(({ ok }) => ok)).toHaveLength(1);
    expect(outcomes.filter(({ ok }) => !ok)).toMatchObject([{ error: { code: "CONFLICT" } }]);
    const decision = approved.ok
      ? { status: "APPROVED", decidedBy: "Olivia", comment: null }
      : { status: "REJECTED", decidedBy: "Adam", comment: "Off-voice." };
    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({ ok: true, value: decision });
    expect(startedApprovalIds).toEqual(approved.ok ? [approvalId] : []);
    const activity = await listActivity(mia, workspaceId);
    if (!activity.ok) throw new Error("expected the Activity Log");
    const decisions = activity.value.filter(({ event }) => event === "APPROVAL_APPROVED" || event === "APPROVAL_REJECTED");
    expect(decisions).toMatchObject([{ event: approved.ok ? "APPROVAL_APPROVED" : "APPROVAL_REJECTED" }]);
  });
});

describe("the approval queue", () => {
  it("lists only Pending Approvals, oldest first, with who submitted them and their Task", async () => {
    const { owner, adam, mia, workspaceId, brandId } = await setUpWorkspace();
    const oldest = await createTestApproval(mia, workspaceId, brandId, "First post.");
    // Only the two Pending ones need an order; the rest run in parallel to keep the test fast.
    const [newest, rejected, approved] = await Promise.all([
      createTestApproval(adam, workspaceId, brandId, "Newest post."),
      createTestApproval(mia, workspaceId, brandId, "Rejected post."),
      createTestApproval(adam, workspaceId, brandId, "Approved post."),
    ]);
    await Promise.all([
      reject(owner, workspaceId, rejected, { comment: "Off-voice." }),
      approve(owner, workspaceId, approved, recordingStartExecution().startExecution),
    ]);

    const queue = await listPendingApprovals(mia, workspaceId);

    expect(queue).toMatchObject({
      ok: true,
      value: [
        { id: oldest, submittedBy: "Mia", submittedAt: expect.any(Date), task: { brand: { id: brandId, name: "Northwind Coffee" } } },
        { id: newest, submittedBy: "Adam" },
      ],
    });
    if (!queue.ok) throw new Error("expected the queue");
    expect(queue.value).toHaveLength(2);
  });

  it("never shows another Workspace's Approvals", async () => {
    const { mia, workspaceId, brandId } = await setUpWorkspace();
    const outsider = await createTestUser("Oscar");
    const outsiderWorkspaceId = await createTestWorkspace(outsider, "other-agency");
    const outsiderBrandId = await createTestBrand(outsider, outsiderWorkspaceId, { name: "Southwind Tea" });
    const [ours, theirs] = await Promise.all([
      createTestApproval(mia, workspaceId, brandId, POST_TEXT),
      createTestApproval(outsider, outsiderWorkspaceId, outsiderBrandId, "Their post."),
    ]);

    expect(await listPendingApprovals(mia, workspaceId)).toMatchObject({ ok: true, value: [{ id: ours }] });
    expect(await listPendingApprovals(outsider, outsiderWorkspaceId)).toMatchObject({ ok: true, value: [{ id: theirs }] });
    expect(await listPendingApprovals(outsider, workspaceId)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("resubmitting after a rejection", () => {
  // Mia submits POST_TEXT and Adam rejects it.
  async function setUpRejected() {
    const setup = await setUpWorkspace();
    const rejectedId = await createTestApproval(setup.mia, setup.workspaceId, setup.brandId, POST_TEXT);
    const rejected = await reject(setup.adam, setup.workspaceId, rejectedId, { comment: "Add the roast date." });
    if (!rejected.ok) throw new Error("Test setup: could not reject.");
    return { ...setup, rejectedId };
  }

  it("leaves the rejected Approval and its Proposed Action unchanged", async () => {
    const { mia, workspaceId, rejectedId } = await setUpRejected();
    const before = await getApproval(mia, workspaceId, rejectedId);
    if (!before.ok) throw new Error("expected the rejected Approval");

    const result = await resubmit(mia, workspaceId, rejectedId);

    if (!result.ok) throw new Error("expected the resubmit to succeed");
    // Only the link to its resubmission is new; the rejected records read exactly as before.
    expect(await getApproval(mia, workspaceId, rejectedId)).toEqual({
      ok: true,
      value: { ...before.value, resubmittedAsId: result.value.id },
    });
  });

  it("proposes the Content Asset again as a new Pending Approval in the queue, and logs it", async () => {
    const { mia, workspaceId, rejectedId } = await setUpRejected();

    const result = await resubmit(mia, workspaceId, rejectedId);

    if (!result.ok) throw new Error("expected the resubmit to succeed");
    const resubmittedId = result.value.id;
    expect(resubmittedId).not.toBe(rejectedId);
    expect(await getApproval(mia, workspaceId, resubmittedId)).toMatchObject({
      ok: true,
      value: {
        status: "PENDING",
        decidedBy: null,
        comment: null,
        resubmissionOfId: rejectedId,
        resubmittedAsId: null,
        proposedAction: { payload: EXPECTED_PAYLOAD, payloadHash: EXPECTED_HASH, createdBy: "Mia" },
        contentAsset: { variant: 1, body: POST_TEXT },
      },
    });
    expect(await listPendingApprovals(mia, workspaceId)).toMatchObject({ ok: true, value: [{ id: resubmittedId }] });
    expect(await listActivity(mia, workspaceId)).toMatchObject({
      ok: true,
      value: [
        { event: "PROPOSED_ACTION_SUBMITTED", actorName: "Mia", approvalId: resubmittedId, details: { payloadHash: EXPECTED_HASH } },
        { event: "APPROVAL_REJECTED", approvalId: rejectedId },
        { event: "PROPOSED_ACTION_SUBMITTED", approvalId: rejectedId },
        { event: "BRAND_CREATED" },
      ],
    });
  });

  it("happens once: a second resubmit of the same rejection is refused", async () => {
    const { owner, mia, workspaceId, rejectedId } = await setUpRejected();
    const first = await resubmit(mia, workspaceId, rejectedId);

    const again = await resubmit(owner, workspaceId, rejectedId);

    expect(again).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    if (!first.ok) throw new Error("expected the first resubmit to succeed");
    expect(await listPendingApprovals(mia, workspaceId)).toMatchObject({ ok: true, value: [{ id: first.value.id }] });
  });

  it("happens once even when two people resubmit at the same moment", async () => {
    const { owner, mia, workspaceId, rejectedId } = await setUpRejected();

    const outcomes = await Promise.all([resubmit(mia, workspaceId, rejectedId), resubmit(owner, workspaceId, rejectedId)]);

    expect(outcomes.filter(({ ok }) => ok)).toHaveLength(1);
    expect(outcomes.filter(({ ok }) => !ok)).toMatchObject([{ error: { code: "CONFLICT" } }]);
    const queue = await listPendingApprovals(mia, workspaceId);
    if (!queue.ok) throw new Error("expected the queue");
    expect(queue.value).toHaveLength(1);
  });

  it("is refused for a Pending or Approved Approval", async () => {
    const { owner, mia, workspaceId, brandId } = await setUpWorkspace();
    const [pendingId, approvedId] = await Promise.all([
      createTestApproval(mia, workspaceId, brandId, POST_TEXT),
      createTestApproval(mia, workspaceId, brandId, "Another post."),
    ]);
    await approve(owner, workspaceId, approvedId, recordingStartExecution().startExecution);

    expect(await resubmit(mia, workspaceId, pendingId)).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await resubmit(mia, workspaceId, approvedId)).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await listPendingApprovals(mia, workspaceId)).toMatchObject({ ok: true, value: [{ id: pendingId }] });
  });
});

describe("another Workspace's Approvals", () => {
  it("can't be submitted, read, approved, rejected or resubmitted: each is not found, and nothing changes", async () => {
    const { mia, workspaceId, brandId } = await setUpWorkspace();
    const outsider = await createTestUser("Oscar");
    // Independent setup, in parallel to keep the test fast.
    const [{ taskId, variantId }, approvalId, outsiderWorkspaceId] = await Promise.all([
      createTestReview(mia, workspaceId, brandId, POST_TEXT),
      createTestApproval(mia, workspaceId, brandId, POST_TEXT),
      createTestWorkspace(outsider, "other-agency"),
    ]);
    const { startExecution, startedApprovalIds } = recordingStartExecution();

    for (const targetWorkspaceId of [workspaceId, outsiderWorkspaceId]) {
      const notFound = { ok: false, error: { code: "NOT_FOUND" } };
      expect(await submitReview(outsider, targetWorkspaceId, taskId, { contentAssetId: variantId })).toMatchObject(notFound);
      expect(await getApproval(outsider, targetWorkspaceId, approvalId)).toMatchObject(notFound);
      expect(await approve(outsider, targetWorkspaceId, approvalId, startExecution)).toMatchObject(notFound);
      expect(await reject(outsider, targetWorkspaceId, approvalId, { comment: "Not mine." })).toMatchObject(notFound);
      expect(await resubmit(outsider, targetWorkspaceId, approvalId)).toMatchObject(notFound);
    }
    expect(startedApprovalIds).toEqual([]);
    expect(await getTask(mia, workspaceId, taskId)).toMatchObject({ ok: true, value: { status: "IN_REVIEW" } });
    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({ ok: true, value: { status: "PENDING" } });
  });
});
