// What the team is told. Plain text with at most a link back to the app: no secrets and
// no approve or reject actions, as deciding happens only in the app.
export interface NotifierMessage {
  text: string;
}

// The only error a Notifier throws. Its message is safe to show and to log: it never
// carries the webhook URL or the outside service's reply.
export class NotificationError extends Error {
  override name = "NotificationError";
}

// Sends a message to a Workspace's Slack incoming webhook. Throws NotificationError
// when it can't. The Slack implementation is src/lib/notifications/slack-notifier.ts;
// tests use the fake in fake-notifier.ts.
export interface Notifier {
  notify(webhookUrl: string, message: NotifierMessage): Promise<void>;
}
