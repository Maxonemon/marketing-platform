import { describe, expect, it } from "vitest";
import { createFakeAiProvider } from "@/lib/ai/fake-provider";
import { AiProviderError } from "@/lib/ai/provider";
import { db } from "@/lib/db";
import { addTestMember, createTestApproval, createTestBrand, createTestReview, createTestUser, createTestWorkspace, fakeVariants } from "@/test/fixtures";
import { listActivity } from "./activity-log";
import { getDashboard } from "./dashboard";
import { requestContent, runContentTask } from "./content-requests";
import { discardReview, getReview } from "./reviews";
import { cancelTask, getTask, listTasks, ONLY_QUEUED_CANCELLABLE } from "./tasks";

const POST_TEXT = "Our autumn blend lands Monday: cocoa, cherry and a long, warm finish.";
const LAUNCH_POST = { contentType: "SOCIAL_POST", channel: "MOCK", brief: "Announce our autumn blend." };

// Olivia owns the Workspace with two Brands and Mia is a Member.
async function setUpWorkspace(slug = "acme-agency") {
  const owner = await createTestUser("Olivia");
  const workspaceId = await createTestWorkspace(owner, slug);
  const mia = await createTestUser("Mia");
  await addTestMember(workspaceId, mia, "MEMBER");
  const brandId = await createTestBrand(owner, workspaceId, { name: "Northwind Coffee" });
  const otherBrandId = await createTestBrand(owner, workspaceId, { name: "Contoso Tea" });
  return { owner, mia, workspaceId, brandId, otherBrandId };
}

async function queueTask(actor: { userId: string }, workspaceId: string, brandId: string): Promise<string> {
  const requested = await requestContent(actor, workspaceId, brandId, LAUNCH_POST, async () => {});
  if (!requested.ok) throw new Error("Test setup: could not request content.");
  return requested.value.id;
}

async function failTask(actor: { userId: string }, workspaceId: string, brandId: string): Promise<string> {
  const taskId = await queueTask(actor, workspaceId, brandId);
  await runContentTask(
    taskId,
    createFakeAiProvider(() => {
      throw new AiProviderError("The AI provider refused the request.");
    }),
  );
  return taskId;
}

describe("the dashboard", () => {
  it("counts open Reviews and Pending Approvals, lists failures and activity, and leaves out other Workspaces", async () => {
    const { mia, workspaceId, brandId, otherBrandId } = await setUpWorkspace();
    const review = await createTestReview(mia, workspaceId, brandId, POST_TEXT);
    await createTestReview(mia, workspaceId, otherBrandId, POST_TEXT);
    const approvalId = await createTestApproval(mia, workspaceId, brandId, POST_TEXT);
    const failedTaskId = await failTask(mia, workspaceId, brandId);
    const other = await setUpWorkspace("other-agency");
    await createTestReview(other.mia, other.workspaceId, other.brandId, POST_TEXT);
    await createTestApproval(other.mia, other.workspaceId, other.brandId, POST_TEXT);
    await failTask(other.mia, other.workspaceId, other.brandId);

    const dashboard = await getDashboard(mia, workspaceId);

    if (!dashboard.ok) throw new Error("expected the dashboard");
    const { openReviewCount, openReviews, pendingApprovalCount, pendingApprovals, recentFailures, recentActivity } = dashboard.value;
    expect(openReviewCount).toBe(2);
    expect(openReviews.map(({ id }) => id)).toContain(review.taskId);
    expect(pendingApprovalCount).toBe(1);
    expect(pendingApprovals).toMatchObject([{ id: approvalId, submittedBy: "Mia" }]);
    expect(recentFailures).toMatchObject([{ event: "TASK_FAILED", taskId: failedTaskId }]);
    expect(recentActivity.length).toBeGreaterThan(0);
    const otherTasks = await db.task.findMany({ where: { workspaceId: other.workspaceId }, select: { id: true } });
    const otherIds = new Set(otherTasks.map(({ id }) => id));
    expect([...openReviews, ...pendingApprovals.map(({ task }) => task)].some(({ id }) => otherIds.has(id))).toBe(false);
    expect(recentActivity.some(({ taskId }) => taskId !== null && otherIds.has(taskId))).toBe(false);
  });

  it("is refused to a non-member", async () => {
    const { workspaceId } = await setUpWorkspace();
    const stranger = await createTestUser("Sam");

    expect(await getDashboard(stranger, workspaceId)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("filtering Task history", () => {
  it("narrows by Brand and by status, within the Workspace only", async () => {
    const { mia, workspaceId, brandId, otherBrandId } = await setUpWorkspace();
    const review = await createTestReview(mia, workspaceId, brandId, POST_TEXT);
    const queued = await queueTask(mia, workspaceId, brandId);
    const otherBrandTask = await queueTask(mia, workspaceId, otherBrandId);
    const other = await setUpWorkspace("other-agency");
    await queueTask(other.mia, other.workspaceId, other.brandId);

    const byBrand = await listTasks(mia, workspaceId, { brandId });
    const byStatus = await listTasks(mia, workspaceId, { status: "QUEUED" });
    const both = await listTasks(mia, workspaceId, { brandId: otherBrandId, status: "QUEUED" });
    const foreignBrand = await listTasks(mia, workspaceId, { brandId: other.brandId });

    const ids = (result: Awaited<ReturnType<typeof listTasks>>) => (result.ok ? result.value.map(({ id }) => id).sort() : null);
    expect(ids(byBrand)).toEqual([review.taskId, queued].sort());
    expect(ids(byStatus)).toEqual([queued, otherBrandTask].sort());
    expect(ids(both)).toEqual([otherBrandTask]);
    expect(ids(foreignBrand)).toEqual([]);
  });

  it("refuses an unknown status", async () => {
    const { mia, workspaceId } = await setUpWorkspace();

    expect(await listTasks(mia, workspaceId, { status: "DONE" as never })).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT", fieldErrors: { status: [expect.any(String)] } },
    });
  });
});

describe("filtering the Activity Log", () => {
  it("narrows by event type, Brand and date", async () => {
    const { owner, mia, workspaceId, brandId, otherBrandId } = await setUpWorkspace();
    await failTask(mia, workspaceId, brandId);
    await failTask(mia, workspaceId, otherBrandId);
    const today = new Date().toISOString().slice(0, 10);

    const failed = await listActivity(owner, workspaceId, { event: "TASK_FAILED" });
    const failedForBrand = await listActivity(owner, workspaceId, { event: "TASK_FAILED", brandId });
    const fromToday = await listActivity(owner, workspaceId, { from: today, to: today });
    const beforeToday = await listActivity(owner, workspaceId, { to: "2000-01-01" });

    expect(failed).toMatchObject({ ok: true, value: [{ event: "TASK_FAILED" }, { event: "TASK_FAILED" }] });
    expect(failedForBrand).toMatchObject({ ok: true, value: [{ event: "TASK_FAILED", brand: { id: brandId } }] });
    expect(fromToday.ok && fromToday.value.length).toBe(4);
    expect(beforeToday).toEqual({ ok: true, value: [] });
  });

  it("refuses a malformed date", async () => {
    const { owner, workspaceId } = await setUpWorkspace();

    expect(await listActivity(owner, workspaceId, { from: "yesterday" })).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT", fieldErrors: { from: [expect.any(String)] } },
    });
  });
});

describe("cancelling a Task", () => {
  it("stops a queued Task from ever calling the AI, and logs it", async () => {
    const { mia, workspaceId, brandId } = await setUpWorkspace();
    const taskId = await queueTask(mia, workspaceId, brandId);
    const ai = createFakeAiProvider(() => fakeVariants(POST_TEXT));

    const cancelled = await cancelTask(mia, workspaceId, taskId);
    await runContentTask(taskId, ai);

    expect(cancelled).toEqual({ ok: true, value: undefined });
    expect(ai.requests).toEqual([]);
    expect(await getTask(mia, workspaceId, taskId)).toMatchObject({ ok: true, value: { status: "CANCELLED" } });
    expect(await listActivity(mia, workspaceId, { event: "TASK_CANCELLED" })).toMatchObject({
      ok: true,
      value: [{ taskId, actorName: "Mia", brand: { id: brandId } }],
    });
  });

  it("refuses a Task that is already running", async () => {
    const { mia, workspaceId, brandId } = await setUpWorkspace();
    const taskId = await queueTask(mia, workspaceId, brandId);
    await db.task.update({ where: { id: taskId }, data: { status: "RUNNING" } });

    expect(await cancelTask(mia, workspaceId, taskId)).toEqual({
      ok: false,
      error: { code: "CONFLICT", message: ONLY_QUEUED_CANCELLABLE },
    });
    expect(await getTask(mia, workspaceId, taskId)).toMatchObject({ ok: true, value: { status: "RUNNING" } });
  });

  it("treats another Workspace's Task as missing", async () => {
    const { workspaceId } = await setUpWorkspace();
    const other = await setUpWorkspace("other-agency");
    const taskId = await queueTask(other.mia, other.workspaceId, other.brandId);
    const owner = await createTestUser("Olga");
    await addTestMember(workspaceId, owner, "OWNER");

    expect(await cancelTask(owner, workspaceId, taskId)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("discarding a Review", () => {
  it("completes the Task without a Proposed Action or Approval, and logs it", async () => {
    const { mia, workspaceId, brandId } = await setUpWorkspace();
    const { taskId } = await createTestReview(mia, workspaceId, brandId, POST_TEXT);

    const discarded = await discardReview(mia, workspaceId, taskId);

    expect(discarded).toEqual({ ok: true, value: undefined });
    expect(await getTask(mia, workspaceId, taskId)).toMatchObject({ ok: true, value: { status: "COMPLETED" } });
    expect(await getReview(mia, workspaceId, taskId)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await db.proposedAction.count({ where: { workspaceId } })).toBe(0);
    expect(await db.approval.count()).toBe(0);
    expect(await listActivity(mia, workspaceId, { event: "REVIEW_DISCARDED" })).toMatchObject({
      ok: true,
      value: [{ taskId, actorName: "Mia" }],
    });
  });

  it("refuses a Task that is not in Review", async () => {
    const { mia, workspaceId, brandId } = await setUpWorkspace();
    const taskId = await queueTask(mia, workspaceId, brandId);

    expect(await discardReview(mia, workspaceId, taskId)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});
