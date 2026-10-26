import { z } from "zod";
import { CredentialDecryptionError, decryptCredential, encryptCredential } from "@/lib/credentials";
import { db } from "@/lib/db";
import { credentialsEnv } from "@/lib/env";
import { SLACK_WEBHOOK_URL_MAX_LENGTH } from "@/lib/limits";
import { NotificationError, type Notifier } from "@/lib/notifications/notifier";
import { requireRole, type Actor } from "@/lib/permissions";
import { appendActivity } from "./activity-log";
import { fail, ok, type Result } from "./result";

// The Slack Integration: one incoming webhook URL per Workspace, managed by Owners and
// Admins. The URL is a secret (anyone holding it can post to the channel): it is stored
// only encrypted, shown only masked, sent only to Slack, and never logged or returned.

export interface SlackIntegrationSummary {
  // e.g. "https://hooks.slack.com/services/…wxyz"; null when the stored URL can't be
  // decrypted (the key changed), so Slack must be connected again.
  maskedWebhookUrl: string | null;
  updatedAt: Date;
}

export type SlackTestResult = { delivered: true } | { delivered: false; error: string };

// As submitted: any string, checked by the schema below.
export interface ConnectSlackInput {
  webhookUrl: string;
}

const SLACK_NOT_CONNECTED = "Slack isn't connected to this Workspace.";
const INVALID_WEBHOOK_URL = "Paste a Slack incoming webhook URL: https://hooks.slack.com/services/…";
const UNREADABLE_WEBHOOK_URL = "The stored webhook URL can't be read: connect Slack again.";
const UNEXPECTED_NOTIFY_ERROR = "The test message couldn't be sent.";

const SLACK_WEBHOOK_ORIGIN = "https://hooks.slack.com";
const SLACK_WEBHOOK_PATH = /^\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9]+$/;
// The masked URL shows this many characters of the secret path.
const MASK_VISIBLE_CHARS = 4;

// Only https://hooks.slack.com/services/<team>/<bot>/<token>: no other host, port,
// credentials, query or fragment, so a stored URL can't point the server anywhere else.
function isSlackWebhookUrl(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (
    url.origin === SLACK_WEBHOOK_ORIGIN &&
    url.username === "" &&
    url.password === "" &&
    url.search === "" &&
    url.hash === "" &&
    SLACK_WEBHOOK_PATH.test(url.pathname)
  );
}

// Error messages are fixed: they never repeat the submitted URL.
const connectSlackSchema = z.object({
  webhookUrl: z
    .string()
    .trim()
    .max(SLACK_WEBHOOK_URL_MAX_LENGTH, INVALID_WEBHOOK_URL)
    .refine(isSlackWebhookUrl, INVALID_WEBHOOK_URL)
    .transform((value) => new URL(value).href),
});

function maskWebhookUrl(webhookUrl: string): string {
  return `${SLACK_WEBHOOK_ORIGIN}/services/…${webhookUrl.slice(-MASK_VISIBLE_CHARS)}`;
}

// Binds the sealed URL to its Workspace: copied into another Workspace's row, it won't open.
function credentialContext(workspaceId: string): string {
  return `integration:${workspaceId}:SLACK`;
}

// Slack reads &, < and > as markup, e.g. "<!channel>" notifies everyone.
function escapeSlackText(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function readWebhookUrl(workspaceId: string, credentialsEnc: string): string | null {
  try {
    return decryptCredential(credentialsEnc, credentialsEnv().credentialKey, credentialContext(workspaceId));
  } catch (error: unknown) {
    if (error instanceof CredentialDecryptionError) return null;
    throw error;
  }
}

async function findSlack(workspaceId: string) {
  return db.integration.findUnique({ where: { workspaceId_type: { workspaceId, type: "SLACK" } } });
}

export async function getSlackIntegration(actor: Actor, workspaceId: string): Promise<Result<SlackIntegrationSummary | null>> {
  const access = await requireRole(actor, workspaceId, "ADMIN");
  if (!access.ok) return access;
  const integration = await findSlack(workspaceId);
  if (!integration) return ok(null);
  const webhookUrl = readWebhookUrl(workspaceId, integration.credentialsEnc);
  return ok({ maskedWebhookUrl: webhookUrl && maskWebhookUrl(webhookUrl), updatedAt: integration.updatedAt });
}

// Connects Slack, or replaces the webhook URL of a connected one.
export async function connectSlack(
  actor: Actor,
  workspaceId: string,
  input: ConnectSlackInput,
): Promise<Result<SlackIntegrationSummary>> {
  const access = await requireRole(actor, workspaceId, "ADMIN");
  if (!access.ok) return access;
  const parsed = connectSlackSchema.safeParse(input);
  if (!parsed.success) return fail("INVALID_INPUT", "Check the webhook URL.", { webhookUrl: [INVALID_WEBHOOK_URL] });
  const { webhookUrl } = parsed.data;
  const credentialsEnc = encryptCredential(webhookUrl, credentialsEnv().credentialKey, credentialContext(workspaceId));
  const integration = await db.$transaction(async (tx) => {
    const where = { workspaceId_type: { workspaceId, type: "SLACK" as const } };
    const existing = await tx.integration.findUnique({ where, select: { id: true } });
    const saved = await tx.integration.upsert({
      where,
      create: { workspaceId, type: "SLACK", credentialsEnc },
      update: { credentialsEnc },
    });
    const event = existing ? "INTEGRATION_UPDATED" : "INTEGRATION_CONNECTED";
    await appendActivity(tx, { workspaceId, actor, event, details: { type: "SLACK" } });
    return saved;
  });
  return ok({ maskedWebhookUrl: maskWebhookUrl(webhookUrl), updatedAt: integration.updatedAt });
}

export async function removeSlack(actor: Actor, workspaceId: string): Promise<Result<void>> {
  const access = await requireRole(actor, workspaceId, "ADMIN");
  if (!access.ok) return access;
  return db.$transaction(async (tx): Promise<Result<void>> => {
    const removed = await tx.integration.deleteMany({ where: { workspaceId, type: "SLACK" } });
    if (removed.count === 0) return fail("NOT_FOUND", SLACK_NOT_CONNECTED);
    await appendActivity(tx, { workspaceId, actor, event: "INTEGRATION_REMOVED", details: { type: "SLACK" } });
    return ok(undefined);
  });
}

// Sends a test message through `notifier` and logs the outcome. A failure is a result,
// not an error: its message is the Notifier's own safe one, or a fixed one.
export async function sendSlackTestMessage(actor: Actor, workspaceId: string, notifier: Notifier): Promise<Result<SlackTestResult>> {
  const access = await requireRole(actor, workspaceId, "ADMIN");
  if (!access.ok) return access;
  const [integration, workspace] = await Promise.all([
    findSlack(workspaceId),
    db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { name: true } }),
  ]);
  if (!integration) return fail("NOT_FOUND", SLACK_NOT_CONNECTED);
  const webhookUrl = readWebhookUrl(workspaceId, integration.credentialsEnc);
  const text = `Test message: Slack is connected to the Workspace "${escapeSlackText(workspace.name)}".`;
  const error = webhookUrl === null ? UNREADABLE_WEBHOOK_URL : await notify(notifier, workspaceId, webhookUrl, text);
  await db.$transaction((tx) =>
    appendActivity(tx, { workspaceId, actor, event: "INTEGRATION_TESTED", details: { type: "SLACK", error } }),
  );
  return ok(error === null ? { delivered: true } : { delivered: false, error });
}

// Returns null when the message went out, else a message safe to show and log.
async function notify(notifier: Notifier, workspaceId: string, webhookUrl: string, text: string): Promise<string | null> {
  try {
    await notifier.notify(webhookUrl, { text });
    return null;
  } catch (error: unknown) {
    if (error instanceof NotificationError) return error.message;
    // Not logged with the error itself: its message may hold the URL.
    console.error(`Workspace ${workspaceId}: the Slack Notifier failed with an unexpected error.`);
    return UNEXPECTED_NOTIFY_ERROR;
  }
}
