import { db } from "@/lib/db";
import { appUrlEnv } from "@/lib/env";
import type { Notifier } from "@/lib/notifications/notifier";
import { appendActivity, type NotificationKind } from "./activity-log";
import { escapeSlackText, findSlackWebhookUrl, notify, UNREADABLE_WEBHOOK_URL } from "./integrations";

// Tells the team on Slack that something needs them, with a link to it in the app.
// Best effort: callers send it only after the change it reports has committed, and it
// never throws, so a Slack failure can't block or roll back a Task, Approval or
// Execution. A failure is logged as NOTIFICATION_FAILED. The message carries only the
// Brand name and a link: no content, no secrets, no approve or reject action.
export type TeamNotification =
  | { kind: "APPROVAL_PENDING"; approvalId: string }
  | { kind: "REVIEW_READY"; taskId: string }
  | { kind: "TASK_FAILED"; taskId: string }
  | { kind: "EXECUTION_FAILED"; approvalId: string };

// What the notification is about, read after the fact.
interface Subject {
  workspaceId: string;
  workspaceSlug: string;
  brandId: string;
  brandName: string;
  taskId?: string;
  approvalId?: string;
}

export async function notifyTeam(notifier: Notifier, notification: TeamNotification): Promise<void> {
  let subject: Subject | null = null;
  try {
    subject = await findSubject(notification);
    if (!subject) return;
    const webhookUrl = await findSlackWebhookUrl(subject.workspaceId);
    if (webhookUrl === "NOT_CONNECTED") return;
    const error =
      webhookUrl === null
        ? UNREADABLE_WEBHOOK_URL
        : await notify(notifier, subject.workspaceId, webhookUrl, messageFor(notification, subject));
    if (error !== null) await logFailure(subject, notification.kind, error);
  } catch {
    // Not logged with the error itself: it could carry the webhook URL.
    console.error(`The ${notification.kind} notification for Workspace ${subject?.workspaceId ?? "unknown"} failed unexpectedly.`);
  }
}

async function findSubject(notification: TeamNotification): Promise<Subject | null> {
  const workspaceSelect = { select: { slug: true } };
  const brandSelect = { select: { id: true, name: true } };
  if ("taskId" in notification) {
    const task = await db.task.findUnique({
      where: { id: notification.taskId },
      select: { workspaceId: true, workspace: workspaceSelect, brand: brandSelect },
    });
    if (!task) return null;
    const { workspaceId, workspace, brand } = task;
    return { workspaceId, workspaceSlug: workspace.slug, brandId: brand.id, brandName: brand.name, taskId: notification.taskId };
  }
  const approval = await db.approval.findUnique({
    where: { id: notification.approvalId },
    select: { proposedAction: { select: { workspaceId: true, workspace: workspaceSelect, brand: brandSelect } } },
  });
  if (!approval) return null;
  const { workspaceId, workspace, brand } = approval.proposedAction;
  return {
    workspaceId,
    workspaceSlug: workspace.slug,
    brandId: brand.id,
    brandName: brand.name,
    approvalId: notification.approvalId,
  };
}

function messageFor(notification: TeamNotification, subject: Subject): string {
  const base = `${appUrlEnv().appUrl}/w/${encodeURIComponent(subject.workspaceSlug)}`;
  const brand = `"${escapeSlackText(oneLine(subject.brandName))}"`;
  switch (notification.kind) {
    case "APPROVAL_PENDING":
      return `New Approval waiting for ${brand}. Decide in the app: ${base}/approvals/${notification.approvalId}`;
    case "REVIEW_READY":
      return `Content for ${brand} is ready to review: ${base}/tasks/${notification.taskId}/review`;
    case "TASK_FAILED":
      return `A content Task for ${brand} failed: ${base}/tasks/${notification.taskId}`;
    case "EXECUTION_FAILED":
      // Final, but possibly delivered (UNCERTAIN): the app says which.
      return `An approved Proposed Action for ${brand} failed to execute. Check it in the app: ${base}/approvals/${notification.approvalId}`;
  }
}

// A name stays on one line and can't fake Slack formatting (*bold*, _italic_, `code`, ~strike~).
const MAX_NAME_LENGTH = 80;
function oneLine(name: string): string {
  return name.replace(/[*_`~]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
}

async function logFailure(subject: Subject, notification: NotificationKind, error: string): Promise<void> {
  const { workspaceId, brandId, taskId, approvalId } = subject;
  await db.$transaction((tx) =>
    appendActivity(tx, {
      workspaceId,
      actor: "system",
      brandId,
      taskId,
      approvalId,
      event: "NOTIFICATION_FAILED",
      details: { type: "SLACK", notification, error },
    }),
  );
}
