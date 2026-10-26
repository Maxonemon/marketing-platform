import { describe, expect, it } from "vitest";
import { createFakeAiProvider } from "@/lib/ai/fake-provider";
import { listActivity } from "@/lib/app/activity-log";
import { approve, expireOverdueApprovals, getApproval, type StartExecution } from "@/lib/app/approvals";
import { requestContent, runContentTask } from "@/lib/app/content-requests";
import { getReview, submitReview } from "@/lib/app/reviews";
import { getTask } from "@/lib/app/tasks";
import { editProposedContent, NOT_EDITABLE } from "@/lib/app/content-assets";
import { NotDeliveredError, type ChannelAdapter, type Delivery } from "@/lib/channels/channel-adapter";
import { createMockChannel } from "@/lib/channels/mock-channel";
import { db, isUniqueViolation } from "@/lib/db";
import { addTestMember, createTestApproval, createTestBrand, createTestUser, createTestWorkspace, fakeVariants } from "@/test/fixtures";
import {
  ATTEMPT_ABANDONED,
  DELIVERY_FAILED,
  DELIVERY_UNCERTAIN,
  executeApproval,
  EXECUTION_START_GRACE_MINUTES,
  MAX_EXECUTION_ATTEMPTS,
  reconcileExecutions,
  STALE_ATTEMPT_MINUTES,
  type ExecutionOutcome,
} from "./execution-service";

const POST_TEXT = "Our autumn blend lands Monday: cocoa, cherry and a long, warm finish.";

// Written out by hand: what the mock Channel must receive for POST_TEXT.
const EXPECTED_PAYLOAD = {
  channel: "MOCK",
  contentType: "SOCIAL_POST",
  content: { body: POST_TEXT },
  audience: null,
  timing: { kind: "AS_SOON_AS_APPROVED" },
};

const ONE_SECOND_MS = 1000;

// Long enough for an Execution started meanwhile to reach its claim.
const SUPERSEDE_HOLD_MS = 1000;

// How long the slow Channel takes, so that a second run overlaps the first's delivery.
const SLOW_DELIVERY_MS = 1000;

// A real Channel's error could carry a credential like this one.
const SECRET_IN_ERROR = "connection reset: token=sk-secret-123";

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
    expect(channel.deliveries).toEqual([{ idempotencyKey: expect.any(String), attempt: 1, payload: EXPECTED_PAYLOAD }]);
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

  it("refuses an Approval the expiry sweep expired, and sends nothing", async () => {
    const { mia, workspaceId, brandId } = await setUpWorkspace();
    const approvalId = await createTestApproval(mia, workspaceId, brandId, POST_TEXT);
    const approval = await getApproval(mia, workspaceId, approvalId);
    if (!approval.ok) throw new Error("expected the Approval");
    const pastDeadline = new Date(approval.value.expiresAt.getTime() + ONE_SECOND_MS);
    await expireOverdueApprovals({ now: () => pastDeadline });
    const channel = createMockChannel();

    const outcome = await executeApproval(approvalId, { MOCK: channel });

    expect(outcome).toEqual({ status: "REFUSED", reason: "NOT_APPROVED" });
    expect(channel.deliveries).toEqual([]);
    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({
      ok: true,
      value: { status: "EXPIRED", executions: [] },
    });
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

  // A supersede that commits while the Execution is between reading the Approval and
  // claiming its attempt must still stop it. The test holds the change uncommitted while
  // the Execution runs, then commits it.
  it("refuses an Approval superseded while the Execution was starting, and sends nothing", async () => {
    const { approvalId } = await setUpApproved();
    const channel = createMockChannel();
    let execution: Promise<ExecutionOutcome> | undefined;

    await db.$transaction(async (tx) => {
      await tx.approval.update({ where: { id: approvalId }, data: { status: "SUPERSEDED" } });
      execution = executeApproval(approvalId, { MOCK: channel });
      await new Promise((resolve) => setTimeout(resolve, SUPERSEDE_HOLD_MS));
    });

    expect(await execution).toEqual({ status: "REFUSED", reason: "NOT_APPROVED" });
    expect(channel.deliveries).toEqual([]);
  });

  // Inngest may deliver an event twice.
  it("treats a duplicate run after a success as done: nothing is sent again", async () => {
    const { mia, workspaceId, approvalId } = await setUpApproved();
    const channel = createMockChannel();
    await executeApproval(approvalId, { MOCK: channel });

    const again = await executeApproval(approvalId, { MOCK: channel });

    expect(again).toEqual({ status: "REFUSED", reason: "ALREADY_SUCCEEDED" });
    expect(channel.deliveries).toHaveLength(1);
    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({
      ok: true,
      value: { executions: [{ attempt: 1, status: "SUCCEEDED" }] },
    });
  });
});

describe("failed attempts and retries", () => {
  it("retries a failed attempt with the same idempotency key: two attempts, one success, no new approval", async () => {
    const { mia, workspaceId, approvalId } = await setUpApproved();
    const calls: Delivery[] = [];
    const failsOnce: ChannelAdapter = {
      deliver: async (delivery) => {
        calls.push(delivery);
        if (calls.length === 1) throw new NotDeliveredError(SECRET_IN_ERROR);
        return { deliveryId: "delivered-on-retry" };
      },
    };

    const first = await executeApproval(approvalId, { MOCK: failsOnce });
    const retry = await executeApproval(approvalId, { MOCK: failsOnce });

    expect(first).toMatchObject({ status: "FAILED", willRetry: true });
    expect(retry).toMatchObject({ status: "SUCCEEDED" });
    expect(calls.map(({ attempt }) => attempt)).toEqual([1, 2]);
    expect(calls[1]?.idempotencyKey).toBe(calls[0]?.idempotencyKey);
    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({
      ok: true,
      value: {
        status: "APPROVED",
        executions: [
          { attempt: 1, status: "FAILED", error: DELIVERY_FAILED, result: null },
          { attempt: 2, status: "SUCCEEDED", error: null, result: { deliveryId: "delivered-on-retry" } },
        ],
      },
    });
    expect(await listActivity(mia, workspaceId)).toMatchObject({
      ok: true,
      value: [
        { event: "EXECUTION_SUCCEEDED", details: { attempt: 2 } },
        { event: "EXECUTION_FAILED", actorName: null, approvalId, details: { attempt: 1, error: DELIVERY_FAILED, final: false } },
        { event: "APPROVAL_APPROVED" },
        { event: "PROPOSED_ACTION_SUBMITTED" },
        { event: "BRAND_CREATED" },
      ],
    });
  });

  it("calls the Channel once when two runs of the same Approval overlap", async () => {
    const { approvalId } = await setUpApproved();
    const channel = createMockChannel();
    const slowChannel: ChannelAdapter = {
      deliver: async (delivery) => {
        await new Promise((resolve) => setTimeout(resolve, SLOW_DELIVERY_MS));
        return channel.deliver(delivery);
      },
    };

    const outcomes = await Promise.all([
      executeApproval(approvalId, { MOCK: slowChannel }),
      executeApproval(approvalId, { MOCK: slowChannel }),
    ]);

    expect(channel.deliveries).toHaveLength(1);
    expect(outcomes).toEqual(
      expect.arrayContaining([
        { status: "SUCCEEDED", executionId: expect.any(String) },
        { status: "REFUSED", reason: "IN_PROGRESS" },
      ]),
    );
  });

  it("stops after the last attempt fails, and logs that failure as final", async () => {
    const { mia, workspaceId, approvalId } = await setUpApproved();
    const channel = createMockChannel({ failedAttempts: MAX_EXECUTION_ATTEMPTS });
    const outcomes: ExecutionOutcome[] = [];
    for (let run = 0; run < MAX_EXECUTION_ATTEMPTS; run += 1) {
      outcomes.push(await executeApproval(approvalId, { MOCK: channel }));
    }

    const afterLast = await executeApproval(approvalId, { MOCK: channel });

    expect(outcomes.map((outcome) => outcome.status === "FAILED" && outcome.willRetry)).toEqual([true, true, false]);
    expect(afterLast).toEqual({ status: "REFUSED", reason: "NO_ATTEMPTS_LEFT" });
    expect(channel.deliveries).toEqual([]);
    const activity = await listActivity(mia, workspaceId);
    const failures = activity.ok ? activity.value.filter((entry) => entry.event === "EXECUTION_FAILED") : [];
    expect(failures.map((entry) => entry.details)).toEqual([
      { attempt: 3, error: DELIVERY_FAILED, final: true },
      { attempt: 2, error: DELIVERY_FAILED, final: false },
      { attempt: 1, error: DELIVERY_FAILED, final: false },
    ]);
  });

  it("never retries an attempt that may have gone out, keeps the Channel's error out, and locks the version", async () => {
    const { mia, workspaceId, approvalId } = await setUpApproved();
    const timesOut: ChannelAdapter = {
      deliver: async () => {
        throw new Error(SECRET_IN_ERROR);
      },
    };
    const channel = createMockChannel();

    const outcome = await executeApproval(approvalId, { MOCK: timesOut });
    const retry = await executeApproval(approvalId, { MOCK: channel });
    const edit = await editProposedContent(mia, workspaceId, approvalId, { body: "An edited post." });

    expect(outcome).toMatchObject({ status: "UNCERTAIN" });
    expect(retry).toEqual({ status: "REFUSED", reason: "MAY_HAVE_BEEN_DELIVERED" });
    expect(channel.deliveries).toEqual([]);
    expect(edit).toMatchObject({ ok: false, error: { code: "CONFLICT", message: NOT_EDITABLE } });
    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({
      ok: true,
      value: { executions: [{ attempt: 1, status: "UNCERTAIN", error: DELIVERY_UNCERTAIN }] },
    });
    expect(JSON.stringify(await listActivity(mia, workspaceId))).not.toContain("sk-secret");
  });

  it("does not retry an Approval superseded after a failed attempt", async () => {
    const { mia, workspaceId, approvalId } = await setUpApproved();
    const channel = createMockChannel({ failedAttempts: 1 });
    await executeApproval(approvalId, { MOCK: channel });
    const edit = await editProposedContent(mia, workspaceId, approvalId, { body: "An edited post." });
    if (!edit.ok) throw new Error("expected a failed attempt to allow the edit");

    const retry = await executeApproval(approvalId, { MOCK: channel });

    expect(retry).toEqual({ status: "REFUSED", reason: "NOT_APPROVED" });
    expect(channel.deliveries).toEqual([]);
  });

  // The execution service never writes a second success; the database refuses one anyway.
  it("lets the database hold at most one SUCCEEDED Execution per Approval", async () => {
    const { approvalId } = await setUpApproved();
    const success = { approvalId, idempotencyKey: `approval:${approvalId}`, status: "SUCCEEDED" as const };
    await db.execution.create({ data: { ...success, attempt: 1 } });

    const second = db.execution.create({ data: { ...success, attempt: 2 } });

    await expect(second).rejects.toSatisfy(isUniqueViolation);
  });
});

describe("reconciling Executions", () => {
  const minutesFromNow = (minutes: number) => ({ now: () => new Date(Date.now() + minutes * 60 * ONE_SECOND_MS) });

  it("starts an Approved Approval whose Execution event was never sent, once the grace period is over", async () => {
    const { owner, mia, workspaceId, brandId } = await setUpWorkspace();
    const approvalId = await createTestApproval(mia, workspaceId, brandId, POST_TEXT);
    const approved = await approve(owner, workspaceId, approvalId, async () => {
      throw new Error("Inngest is unreachable");
    });
    const started: string[] = [];
    const startExecution: StartExecution = async (id) => {
      started.push(id);
    };

    const tooSoon = await reconcileExecutions(startExecution, minutesFromNow(1));
    const afterGrace = await reconcileExecutions(startExecution, minutesFromNow(EXECUTION_START_GRACE_MINUTES + 1));

    expect(approved).toEqual({ ok: true, value: undefined });
    expect(tooSoon).toEqual({ started: 0, failedToStart: 0, markedUncertain: 0 });
    expect(afterGrace).toEqual({ started: 1, failedToStart: 0, markedUncertain: 0 });
    expect(started).toEqual([approvalId]);
  });

  // Inngest's retries normally follow a failed attempt; if they all stopped before
  // claiming one (e.g. the database was down), nothing else would run it.
  it("leaves a recent failed attempt to the retries, and restarts one whose retries stopped", async () => {
    const { approvalId } = await setUpApproved();
    await executeApproval(approvalId, { MOCK: createMockChannel({ failedAttempts: 1 }) });
    const started: string[] = [];
    const startExecution: StartExecution = async (id) => {
      started.push(id);
    };

    const recent = await reconcileExecutions(startExecution, minutesFromNow(1));
    const stalled = await reconcileExecutions(startExecution, minutesFromNow(EXECUTION_START_GRACE_MINUTES + 1));

    expect(recent).toEqual({ started: 0, failedToStart: 0, markedUncertain: 0 });
    expect(stalled).toEqual({ started: 1, failedToStart: 0, markedUncertain: 0 });
    expect(started).toEqual([approvalId]);
  });

  it.each([
    ["whose last attempt failed", createMockChannel({ failedAttempts: MAX_EXECUTION_ATTEMPTS }), MAX_EXECUTION_ATTEMPTS],
    ["that succeeded", createMockChannel(), 1],
  ])("never restarts an Approval %s", async (_case, channel, runs) => {
    const { approvalId } = await setUpApproved();
    for (let run = 0; run < runs; run += 1) await executeApproval(approvalId, { MOCK: channel });
    const started: string[] = [];

    const outcome = await reconcileExecutions(async (id) => {
      started.push(id);
    }, minutesFromNow(EXECUTION_START_GRACE_MINUTES + 1));

    expect(outcome).toEqual({ started: 0, failedToStart: 0, markedUncertain: 0 });
    expect(started).toEqual([]);
  });

  it("still marks abandoned attempts when an event can't be sent, and counts the failed send", async () => {
    const unsent = await setUpApproved();
    const abandonedId = await createTestApproval(unsent.mia, unsent.workspaceId, unsent.brandId, "Second post.");
    await approve(unsent.owner, unsent.workspaceId, abandonedId, startNothing);
    await db.execution.create({ data: { approvalId: abandonedId, idempotencyKey: `approval:${abandonedId}`, attempt: 1 } });

    const outcome = await reconcileExecutions(async () => {
      throw new Error("Inngest is unreachable: key=evt-secret");
    }, minutesFromNow(STALE_ATTEMPT_MINUTES + 1));

    expect(outcome).toEqual({ started: 0, failedToStart: 1, markedUncertain: 1 });
  });

  // The sweep runs while the Channel is still delivering, as if the delivery took longer
  // than STALE_ATTEMPT_MINUTES.
  const sweepMeanwhile = () => reconcileExecutions(startNothing, minutesFromNow(STALE_ATTEMPT_MINUTES + 1));

  it("keeps the UNCERTAIN mark when a delivery the sweep gave up on fails late", async () => {
    const { mia, workspaceId, approvalId } = await setUpApproved();
    const failsLate: ChannelAdapter = {
      deliver: async () => {
        await sweepMeanwhile();
        throw new NotDeliveredError("timed out");
      },
    };

    const failed = await executeApproval(approvalId, { MOCK: failsLate });
    const retry = await executeApproval(approvalId, { MOCK: createMockChannel() });

    expect(failed).toMatchObject({ status: "UNCERTAIN" });
    expect(retry).toEqual({ status: "REFUSED", reason: "MAY_HAVE_BEEN_DELIVERED" });
    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({
      ok: true,
      value: { executions: [{ attempt: 1, status: "UNCERTAIN", error: ATTEMPT_ABANDONED }] },
    });
    const activity = await listActivity(mia, workspaceId);
    const failures = activity.ok ? activity.value.filter((entry) => entry.event === "EXECUTION_FAILED") : [];
    expect(failures.map((entry) => entry.details)).toEqual([{ attempt: 1, error: ATTEMPT_ABANDONED, final: true }]);
  });

  it("records a late success over the sweep's UNCERTAIN mark", async () => {
    const { mia, workspaceId, approvalId } = await setUpApproved();
    const succeedsLate: ChannelAdapter = {
      deliver: async () => {
        await sweepMeanwhile();
        return { deliveryId: "late" };
      },
    };

    const delivered = await executeApproval(approvalId, { MOCK: succeedsLate });

    expect(delivered).toMatchObject({ status: "SUCCEEDED" });
    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({
      ok: true,
      value: { executions: [{ attempt: 1, status: "SUCCEEDED", result: { deliveryId: "late" } }] },
    });
  });

  // The process died mid-delivery: the test inserts the attempt it left STARTED.
  it("marks an attempt left STARTED as UNCERTAIN, logs it as final, and never retries it", async () => {
    const { mia, workspaceId, approvalId } = await setUpApproved();
    await db.execution.create({ data: { approvalId, idempotencyKey: `approval:${approvalId}`, attempt: 1 } });
    const channel = createMockChannel();

    const fresh = await reconcileExecutions(startNothing, minutesFromNow(1));
    const stale = await reconcileExecutions(startNothing, minutesFromNow(STALE_ATTEMPT_MINUTES + 1));
    const retry = await executeApproval(approvalId, { MOCK: channel });

    expect(fresh).toEqual({ started: 0, failedToStart: 0, markedUncertain: 0 });
    expect(stale).toEqual({ started: 0, failedToStart: 0, markedUncertain: 1 });
    expect(retry).toEqual({ status: "REFUSED", reason: "MAY_HAVE_BEEN_DELIVERED" });
    expect(channel.deliveries).toEqual([]);
    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({
      ok: true,
      value: { executions: [{ attempt: 1, status: "UNCERTAIN", error: ATTEMPT_ABANDONED, finishedAt: expect.any(Date) }] },
    });
    expect(await listActivity(mia, workspaceId)).toMatchObject({
      ok: true,
      value: [
        { event: "EXECUTION_FAILED", actorName: null, approvalId, details: { attempt: 1, error: ATTEMPT_ABANDONED, final: true } },
        { event: "APPROVAL_APPROVED" },
        { event: "PROPOSED_ACTION_SUBMITTED" },
        { event: "BRAND_CREATED" },
      ],
    });
  });
});
