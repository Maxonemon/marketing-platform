import { describe, expect, it } from "vitest";
import { createFakeAiProvider } from "@/lib/ai/fake-provider";
import { listActivity } from "@/lib/app/activity-log";
import { approve, getApproval, type StartExecution } from "@/lib/app/approvals";
import { requestContent, runContentTask } from "@/lib/app/content-requests";
import { getReview, submitReview } from "@/lib/app/reviews";
import { getTask } from "@/lib/app/tasks";
import type { ChannelAdapter } from "@/lib/channels/channel-adapter";
import { createMockChannel } from "@/lib/channels/mock-channel";
import { db } from "@/lib/db";
import { addTestMember, createTestApproval, createTestBrand, createTestUser, createTestWorkspace, fakeVariants } from "@/test/fixtures";
import { DELIVERY_FAILED, executeApproval } from "./execution-service";

const POST_TEXT = "Our autumn blend lands Monday: cocoa, cherry and a long, warm finish.";

// Written out by hand: what the mock Channel must receive for POST_TEXT.
const EXPECTED_PAYLOAD = {
  channel: "MOCK",
  contentType: "SOCIAL_POST",
  content: { body: POST_TEXT },
  audience: null,
  timing: { kind: "AS_SOON_AS_APPROVED" },
};

// approve's background start; these tests run the Execution themselves.
const startNothing: StartExecution = async () => {};

// Olivia owns the Workspace and Mia is a Member.
async function setUpWorkspace() {
  const owner = await createTestUser("Olivia");
  const workspaceId = await createTestWorkspace(owner, "acme-agency");
  const mia = await createTestUser("Mia");
  await addTestMember(workspaceId, mia, "MEMBER");
  const brandId = await createTestBrand(owner, workspaceId, { name: "Northwind Coffee" });
  return { owner, mia, workspaceId, brandId };
}

// Mia submits POST_TEXT and Olivia approves it.
async function setUpApproved() {
  const setup = await setUpWorkspace();
  const approvalId = await createTestApproval(setup.mia, setup.workspaceId, setup.brandId, POST_TEXT);
  const approved = await approve(setup.owner, setup.workspaceId, approvalId, startNothing);
  if (!approved.ok) throw new Error("Test setup: could not approve.");
  return { ...setup, approvalId };
}

describe("the tracer bullet", () => {
  it("goes from a Brand to a mock Execution of exactly the approved payload, all in the Activity Log", async () => {
    const { owner, mia, workspaceId, brandId } = await setUpWorkspace();
    const request = { contentType: "SOCIAL_POST", channel: "MOCK", brief: "Announce our autumn blend." };
    const requested = await requestContent(mia, workspaceId, brandId, request, async () => {});
    if (!requested.ok) throw new Error("expected the request to succeed");
    const taskId = requested.value.id;
    await runContentTask(taskId, createFakeAiProvider(() => fakeVariants(POST_TEXT)));
    const review = await getReview(mia, workspaceId, taskId);
    const variantId = review.ok ? review.value.variants[0]?.id : undefined;
    if (!variantId) throw new Error("expected a Review with Variants");
    const submitted = await submitReview(mia, workspaceId, taskId, { contentAssetId: variantId });
    if (!submitted.ok) throw new Error("expected the submit to succeed");
    const approvalId = submitted.value.id;
    const startedApprovalIds: string[] = [];
    await approve(owner, workspaceId, approvalId, async (id) => {
      startedApprovalIds.push(id);
    });
    const channel = createMockChannel();

    const outcome = await executeApproval(startedApprovalIds[0] ?? "", { MOCK: channel });

    expect(outcome).toMatchObject({ status: "SUCCEEDED" });
    expect(channel.deliveries).toEqual([{ idempotencyKey: expect.any(String), payload: EXPECTED_PAYLOAD }]);
    expect(await getTask(mia, workspaceId, taskId)).toMatchObject({ ok: true, value: { status: "COMPLETED" } });
    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({
      ok: true,
      value: {
        status: "APPROVED",
        decidedBy: "Olivia",
        proposedAction: { payload: EXPECTED_PAYLOAD, createdBy: "Mia" },
        executions: [{ attempt: 1, status: "SUCCEEDED", error: null, finishedAt: expect.any(Date) }],
      },
    });
    expect(await listActivity(mia, workspaceId)).toMatchObject({
      ok: true,
      value: [
        { event: "EXECUTION_SUCCEEDED", actorName: null, brand: { id: brandId }, approvalId, details: { channel: "MOCK", attempt: 1 } },
        { event: "APPROVAL_APPROVED", actorName: "Olivia", approvalId },
        { event: "PROPOSED_ACTION_SUBMITTED", actorName: "Mia", taskId, approvalId },
        { event: "BRAND_CREATED" },
      ],
    });
  });
});

describe("the execution service", () => {
  it("refuses a Pending Approval: nothing is sent and no attempt is recorded", async () => {
    const { mia, workspaceId, brandId } = await setUpWorkspace();
    const approvalId = await createTestApproval(mia, workspaceId, brandId, POST_TEXT);
    const channel = createMockChannel();

    const outcome = await executeApproval(approvalId, { MOCK: channel });

    expect(outcome).toEqual({ status: "REFUSED", reason: "NOT_APPROVED" });
    expect(channel.deliveries).toEqual([]);
    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({ ok: true, value: { executions: [] } });
  });

  // The operations that reject, expire and supersede arrive in tickets 05, 09 and 08;
  // until then these statuses are set directly.
  it.each(["REJECTED", "EXPIRED", "SUPERSEDED"] as const)("refuses a %s Approval", async (status) => {
    const { mia, workspaceId, brandId } = await setUpWorkspace();
    const approvalId = await createTestApproval(mia, workspaceId, brandId, POST_TEXT);
    await db.approval.update({ where: { id: approvalId }, data: { status } });
    const channel = createMockChannel();

    const outcome = await executeApproval(approvalId, { MOCK: channel });

    expect(outcome).toEqual({ status: "REFUSED", reason: "NOT_APPROVED" });
    expect(channel.deliveries).toEqual([]);
  });

  // No code updates a Proposed Action, so the test changes the stored row directly.
  it.each([
    ["a changed body", { ...EXPECTED_PAYLOAD, content: { body: "Everything is free today!" } }],
    ["an added field", { ...EXPECTED_PAYLOAD, recipients: ["everyone@example.com"] }],
  ])("refuses an Approved payload tampered with after approval (%s)", async (_change, tampered) => {
    const { mia, workspaceId, approvalId } = await setUpApproved();
    const approval = await getApproval(mia, workspaceId, approvalId);
    if (!approval.ok) throw new Error("expected the Approval");
    await db.proposedAction.update({ where: { id: approval.value.proposedAction.id }, data: { payload: tampered } });
    const channel = createMockChannel();

    const outcome = await executeApproval(approvalId, { MOCK: channel });

    expect(outcome).toEqual({ status: "REFUSED", reason: "PAYLOAD_CHANGED" });
    expect(channel.deliveries).toEqual([]);
    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({
      ok: true,
      value: { proposedAction: { payload: null }, executions: [] },
    });
  });

  // Inngest may deliver an event twice. Retries come with ticket 10.
  it("executes each Approval once: a second run sends nothing", async () => {
    const { approvalId } = await setUpApproved();
    const channel = createMockChannel();
    await executeApproval(approvalId, { MOCK: channel });

    const again = await executeApproval(approvalId, { MOCK: channel });

    expect(again).toEqual({ status: "REFUSED", reason: "ALREADY_ATTEMPTED" });
    expect(channel.deliveries).toHaveLength(1);
  });

  it("records a failed delivery as a FAILED attempt with a safe error, and rethrows", async () => {
    const { mia, workspaceId, approvalId } = await setUpApproved();
    const outage = new Error("connection refused: token=sk-secret-123");
    const failingChannel: ChannelAdapter = {
      deliver: async () => {
        throw outage;
      },
    };

    await expect(executeApproval(approvalId, { MOCK: failingChannel })).rejects.toBe(outage);

    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({
      ok: true,
      value: { executions: [{ attempt: 1, status: "FAILED", error: DELIVERY_FAILED, finishedAt: expect.any(Date) }] },
    });
  });
});
