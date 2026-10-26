import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { createFakeNotifier } from "@/lib/notifications/fake-notifier";
import type { Notifier } from "@/lib/notifications/notifier";
import { addTestMember, createTestUser, createTestWorkspace } from "@/test/fixtures";
import { listActivity } from "./activity-log";
import { connectSlack, getSlackIntegration, removeSlack, sendSlackTestMessage } from "./integrations";

const TOKEN = "abcdefghijklmnopqrstuvwx";
const WEBHOOK_URL = `https://hooks.slack.com/services/T0001/B0001/${TOKEN}`;
const OTHER_WEBHOOK_URL = "https://hooks.slack.com/services/T0001/B0002/zyxwvutsrqponmlkjihgfedc";

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

describe("Slack Integration", () => {
  beforeEach(() => {
    vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    return () => vi.unstubAllEnvs();
  });

  it("stores the webhook URL encrypted and shows it only masked", async () => {
    const { owner, workspaceId } = await setUpWorkspace();

    const connected = await connectSlack(owner, workspaceId, { webhookUrl: `  ${WEBHOOK_URL} ` });
    const shown = await getSlackIntegration(owner, workspaceId);
    const stored = await db.integration.findFirstOrThrow({ where: { workspaceId } });

    expect(connected).toMatchObject({ ok: true, value: { maskedWebhookUrl: "https://hooks.slack.com/services/…uvwx" } });
    expect(shown).toEqual(connected);
    expect(stored.credentialsEnc).not.toContain(TOKEN);
    expect(stored.credentialsEnc).not.toContain("hooks.slack.com");
  });

  it("lets an Admin replace the webhook URL, and shows nothing before Slack is connected", async () => {
    const { owner, adam, workspaceId } = await setUpWorkspace();
    const before = await getSlackIntegration(adam, workspaceId);
    await connectSlack(owner, workspaceId, { webhookUrl: WEBHOOK_URL });

    const updated = await connectSlack(adam, workspaceId, { webhookUrl: OTHER_WEBHOOK_URL });

    expect(before).toEqual({ ok: true, value: null });
    expect(updated).toMatchObject({ ok: true, value: { maskedWebhookUrl: "https://hooks.slack.com/services/…fedc" } });
    expect(await db.integration.count({ where: { workspaceId } })).toBe(1);
  });

  it("refuses a Member, and treats a non-member as if the Workspace didn't exist", async () => {
    const { owner, mia, workspaceId } = await setUpWorkspace();
    await connectSlack(owner, workspaceId, { webhookUrl: WEBHOOK_URL });
    const outsider = await createTestUser("Oscar");
    const notifier = createFakeNotifier();

    expect(await connectSlack(mia, workspaceId, { webhookUrl: OTHER_WEBHOOK_URL })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await getSlackIntegration(mia, workspaceId)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await sendSlackTestMessage(mia, workspaceId, notifier)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await removeSlack(mia, workspaceId)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await connectSlack(outsider, workspaceId, { webhookUrl: OTHER_WEBHOOK_URL })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(notifier.sent).toEqual([]);
    expect(await getSlackIntegration(owner, workspaceId)).toMatchObject({ ok: true, value: { maskedWebhookUrl: expect.stringMatching(/uvwx$/) } });
  });

  it.each([
    ["plain http", `http://hooks.slack.com/services/T0001/B0001/${TOKEN}`],
    ["another host", `https://example.com/services/T0001/B0001/${TOKEN}`],
    ["a look-alike host", `https://hooks.slack.com.example.com/services/T0001/B0001/${TOKEN}`],
    ["credentials in the URL", `https://user:pw@hooks.slack.com/services/T0001/B0001/${TOKEN}`],
    ["a port", `https://hooks.slack.com:8443/services/T0001/B0001/${TOKEN}`],
    ["a query", `${WEBHOOK_URL}?next=https://example.com`],
    ["another path", `https://hooks.slack.com/triggers/T0001/B0001/${TOKEN}`],
    ["not a URL", "hooks.slack.com/services"],
  ])("refuses a webhook URL with %s, without repeating it", async (_case, webhookUrl) => {
    const { owner, workspaceId } = await setUpWorkspace();

    const result = await connectSlack(owner, workspaceId, { webhookUrl });

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", fieldErrors: { webhookUrl: [expect.any(String)] } } });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(await db.integration.count()).toBe(0);
  });

  it("sends a test message to the stored webhook URL", async () => {
    const { adam, workspaceId } = await setUpWorkspace();
    await connectSlack(adam, workspaceId, { webhookUrl: WEBHOOK_URL });
    const notifier = createFakeNotifier();

    const result = await sendSlackTestMessage(adam, workspaceId, notifier);

    expect(result).toEqual({ ok: true, value: { delivered: true } });
    expect(notifier.sent).toEqual([{ webhookUrl: WEBHOOK_URL, message: { text: expect.stringContaining("acme-agency") } }]);
  });

  it("reports a failed test message with the Notifier's safe message", async () => {
    const { owner, workspaceId } = await setUpWorkspace();
    await connectSlack(owner, workspaceId, { webhookUrl: WEBHOOK_URL });

    const result = await sendSlackTestMessage(owner, workspaceId, createFakeNotifier({ failWith: "Slack refused the message (HTTP 404)." }));

    expect(result).toEqual({ ok: true, value: { delivered: false, error: "Slack refused the message (HTTP 404)." } });
  });

  it("reports any other failure with a fixed message, never the URL", async () => {
    const { owner, workspaceId } = await setUpWorkspace();
    await connectSlack(owner, workspaceId, { webhookUrl: WEBHOOK_URL });
    const leakyNotifier: Notifier = {
      async notify(webhookUrl) {
        throw new Error(`request to ${webhookUrl} failed`);
      },
    };

    const result = await sendSlackTestMessage(owner, workspaceId, leakyNotifier);

    expect(result).toMatchObject({ ok: true, value: { delivered: false, error: expect.any(String) } });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(JSON.stringify(result)).not.toContain("hooks.slack.com");
  });

  it("can't send a test message before Slack is connected, or after it is removed", async () => {
    const { owner, workspaceId } = await setUpWorkspace();
    const notifier = createFakeNotifier();
    const before = await sendSlackTestMessage(owner, workspaceId, notifier);
    await connectSlack(owner, workspaceId, { webhookUrl: WEBHOOK_URL });

    const removed = await removeSlack(owner, workspaceId);
    const after = await sendSlackTestMessage(owner, workspaceId, notifier);

    expect(before).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(removed).toEqual({ ok: true, value: undefined });
    expect(after).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await getSlackIntegration(owner, workspaceId)).toEqual({ ok: true, value: null });
    expect(notifier.sent).toEqual([]);
  });

  it("logs connecting, updating, testing and removing, and no entry contains the webhook URL", async () => {
    const { owner, adam, workspaceId } = await setUpWorkspace();
    await connectSlack(owner, workspaceId, { webhookUrl: WEBHOOK_URL });
    await connectSlack(adam, workspaceId, { webhookUrl: OTHER_WEBHOOK_URL });
    await sendSlackTestMessage(adam, workspaceId, createFakeNotifier());
    await sendSlackTestMessage(adam, workspaceId, { notify: async (url) => Promise.reject(new Error(`failed: ${url}`)) });
    await removeSlack(owner, workspaceId);

    const log = await listActivity(owner, workspaceId);
    const rows = await db.activityLogEntry.findMany({ where: { workspaceId } });

    expect(log).toMatchObject({
      ok: true,
      value: [
        { event: "INTEGRATION_REMOVED", actorName: "Olivia", details: { type: "SLACK" } },
        { event: "INTEGRATION_TESTED", actorName: "Adam", details: { type: "SLACK", error: expect.any(String) } },
        { event: "INTEGRATION_TESTED", actorName: "Adam", details: { type: "SLACK", error: null } },
        { event: "INTEGRATION_UPDATED", actorName: "Adam", details: { type: "SLACK" } },
        { event: "INTEGRATION_CONNECTED", actorName: "Olivia", details: { type: "SLACK" } },
      ],
    });
    for (const text of [JSON.stringify(log), JSON.stringify(rows)]) {
      expect(text).not.toContain("hooks.slack.com");
      expect(text).not.toContain(TOKEN);
      expect(text).not.toContain("zyxwvutsrqponmlkjihgfedc");
    }
  });
});
