import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeAiProvider } from "@/lib/ai/fake-provider";
import { AiProviderError } from "@/lib/ai/provider";
import { NotDeliveredError, type ChannelAdapter } from "@/lib/channels/channel-adapter";
import { createFakeNotifier } from "@/lib/notifications/fake-notifier";
import { systemClock } from "@/lib/clock";
import { db } from "@/lib/db";
import { executeApproval, MAX_EXECUTION_ATTEMPTS, reconcileExecutions, STALE_ATTEMPT_MINUTES } from "@/lib/workflows/execution-service";
import { addTestMember, createTestApproval, createTestBrand, createTestUser, createTestWorkspace, fakeVariants } from "@/test/fixtures";
import { listActivity } from "./activity-log";
import { approve } from "./approvals";
import { requestContent, runContentTask } from "./content-requests";
import { connectSlack } from "./integrations";
import { notifyTeam } from "./notifications";
import { getTask } from "./tasks";

const TOKEN = "abcdefghijklmnopqrstuvwx";
const WEBHOOK_URL = `https://hooks.slack.com/services/T0001/B0001/${TOKEN}`;
const APP_URL = "https://marketing.example.test";
const POST_TEXT = "Our autumn blend lands Monday: cocoa, cherry and a long, warm finish.";
const LAUNCH_POST = { contentType: "SOCIAL_POST", channel: "MOCK", brief: "Announce our autumn blend." };

// Olivia owns the Workspace and Mia is a Member; Slack is connected unless told otherwise.
async function setUpWorkspace({ slack = true } = {}) {
  const owner = await createTestUser("Olivia");
  const workspaceId = await createTestWorkspace(owner, "acme-agency");
  const mia = await createTestUser("Mia");
  await addTestMember(workspaceId, mia, "MEMBER");
  const brandId = await createTestBrand(owner, workspaceId, { name: "Northwind <!channel> Coffee" });
  if (slack) await connectSlack(owner, workspaceId, { webhookUrl: WEBHOOK_URL });
  return { owner, mia, workspaceId, brandId };
}

async function queueTask(setup: Awaited<ReturnType<typeof setUpWorkspace>>): Promise<string> {
  const requested = await requestContent(setup.mia, setup.workspaceId, setup.brandId, LAUNCH_POST, async () => {});
  if (!requested.ok) throw new Error("Test setup: could not request content.");
  return requested.value.id;
}

const failsEveryTime: ChannelAdapter = {
  deliver: async () => {
    throw new NotDeliveredError("down");
  },
};

describe("Slack notifications", () => {
  beforeEach(() => {
    vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    vi.stubEnv("BETTER_AUTH_URL", `${APP_URL}/`);
    return () => vi.unstubAllEnvs();
  });

  it("tells the team when a Review is ready, with a link and the Brand name escaped", async () => {
    const setup = await setUpWorkspace();
    const taskId = await queueTask(setup);
    const notifier = createFakeNotifier();

    await runContentTask(taskId, createFakeAiProvider(() => fakeVariants(POST_TEXT)), { notifier });

    expect(notifier.sent).toEqual([
      {
        webhookUrl: WEBHOOK_URL,
        message: {
          text: `Content for "Northwind &lt;!channel&gt; Coffee" is ready to review: ${APP_URL}/w/acme-agency/tasks/${taskId}/review`,
        },
      },
    ]);
  });

  it("tells the team when a Task fails", async () => {
    const setup = await setUpWorkspace();
    const taskId = await queueTask(setup);
    const notifier = createFakeNotifier();
    const ai = createFakeAiProvider(() => {
      throw new AiProviderError("The AI provider refused the request.");
    });

    await runContentTask(taskId, ai, { notifier });

    expect(notifier.sent.map(({ message }) => message.text)).toEqual([
      expect.stringContaining(`failed: ${APP_URL}/w/acme-agency/tasks/${taskId}`),
    ]);
  });

  it("tells the team about a new Pending Approval with only a link: no content, no decision", async () => {
    const setup = await setUpWorkspace();
    const approvalId = await createTestApproval(setup.mia, setup.workspaceId, setup.brandId, POST_TEXT);
    const notifier = createFakeNotifier();

    await notifyTeam(notifier, { kind: "APPROVAL_PENDING", approvalId });

    expect(notifier.sent).toHaveLength(1);
    const text = notifier.sent[0]?.message.text ?? "";
    expect(text).toContain(`${APP_URL}/w/acme-agency/approvals/${approvalId}`);
    expect(text).not.toContain(POST_TEXT);
    expect(text).not.toContain(TOKEN);
  });

  it("tells the team once, when an Execution finally fails, not on the attempts that will be retried", async () => {
    const setup = await setUpWorkspace();
    const approvalId = await createTestApproval(setup.mia, setup.workspaceId, setup.brandId, POST_TEXT);
    await approve(setup.owner, setup.workspaceId, approvalId, async () => {});
    const notifier = createFakeNotifier();

    for (let attempt = 1; attempt <= MAX_EXECUTION_ATTEMPTS; attempt += 1) {
      await executeApproval(approvalId, { MOCK: failsEveryTime }, notifier);
    }

    expect(notifier.sent.map(({ message }) => message.text)).toEqual([
      expect.stringContaining(`failed to execute. Check it in the app: ${APP_URL}/w/acme-agency/approvals/${approvalId}`),
    ]);
  });

  it("tells the team once when the reconcile sweep gives up on an abandoned attempt, however often it runs", async () => {
    const setup = await setUpWorkspace();
    const approvalId = await createTestApproval(setup.mia, setup.workspaceId, setup.brandId, POST_TEXT);
    await approve(setup.owner, setup.workspaceId, approvalId, async () => {});
    // The process died mid-delivery: an attempt left STARTED, long ago.
    const startedAt = new Date(Date.now() - (STALE_ATTEMPT_MINUTES + 1) * 60 * 1000);
    await db.execution.create({ data: { approvalId, idempotencyKey: `approval:${approvalId}`, attempt: 1, startedAt } });
    const notifier = createFakeNotifier();

    await reconcileExecutions(async () => {}, systemClock, notifier);
    await reconcileExecutions(async () => {}, systemClock, notifier);

    expect(notifier.sent.map(({ message }) => message.text)).toEqual([
      expect.stringContaining(`${APP_URL}/w/acme-agency/approvals/${approvalId}`),
    ]);
  });

  it("keeps a Brand name on one line, without Slack formatting", async () => {
    const setup = await setUpWorkspace();
    const taskId = await queueTask(setup);
    await db.brand.update({ where: { id: setup.brandId }, data: { name: "*Big*\n\nSALE _now_" } });
    const notifier = createFakeNotifier();

    await notifyTeam(notifier, { kind: "TASK_FAILED", taskId });

    expect(notifier.sent[0]?.message.text).toMatch(/^A content Task for "Big SALE now" failed: /);
  });

  it("logs a failing Notifier as an Integration error and leaves the Task as it was", async () => {
    const setup = await setUpWorkspace();
    const taskId = await queueTask(setup);
    const notifier = createFakeNotifier({ failWith: "Slack refused the message (HTTP 403)." });

    const outcome = await runContentTask(taskId, createFakeAiProvider(() => fakeVariants(POST_TEXT)), { notifier });

    expect(outcome).toBe("DONE");
    expect(await getTask(setup.mia, setup.workspaceId, taskId)).toMatchObject({ ok: true, value: { status: "IN_REVIEW" } });
    expect(await listActivity(setup.owner, setup.workspaceId, { event: "NOTIFICATION_FAILED" })).toMatchObject({
      ok: true,
      value: [
        {
          taskId,
          actorName: null,
          details: { type: "SLACK", notification: "REVIEW_READY", error: "Slack refused the message (HTTP 403)." },
        },
      ],
    });
  });

  it("leaves a final Execution failure recorded when the Notifier fails", async () => {
    const setup = await setUpWorkspace();
    const approvalId = await createTestApproval(setup.mia, setup.workspaceId, setup.brandId, POST_TEXT);
    await approve(setup.owner, setup.workspaceId, approvalId, async () => {});
    const notifier = createFakeNotifier({ failWith: "Slack couldn't be reached." });

    let last;
    for (let attempt = 1; attempt <= MAX_EXECUTION_ATTEMPTS; attempt += 1) {
      last = await executeApproval(approvalId, { MOCK: failsEveryTime }, notifier);
    }

    expect(last).toMatchObject({ status: "FAILED", willRetry: false });
    const log = await listActivity(setup.owner, setup.workspaceId, { event: "NOTIFICATION_FAILED" });
    expect(log).toMatchObject({ ok: true, value: [{ approvalId, details: { notification: "EXECUTION_FAILED" } }] });
  });

  it("sends nothing for a Workspace without Slack", async () => {
    const setup = await setUpWorkspace({ slack: false });
    const taskId = await queueTask(setup);
    const notifier = createFakeNotifier();

    await runContentTask(taskId, createFakeAiProvider(() => fakeVariants(POST_TEXT)), { notifier });
    await notifyTeam(notifier, { kind: "REVIEW_READY", taskId });

    expect(notifier.sent).toEqual([]);
    expect(await listActivity(setup.owner, setup.workspaceId, { event: "NOTIFICATION_FAILED" })).toEqual({ ok: true, value: [] });
  });
});
