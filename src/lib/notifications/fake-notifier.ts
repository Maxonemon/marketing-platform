import { NotificationError, type Notifier, type NotifierMessage } from "./notifier";

export interface SentNotification {
  webhookUrl: string;
  message: NotifierMessage;
}

export interface FakeNotifier extends Notifier {
  // Every message it was given that "went out", oldest first.
  readonly sent: readonly SentNotification[];
}

export interface FakeNotifierOptions {
  // Fails every message with this NotificationError message instead of recording it.
  failWith?: string;
}

// Stands in for Slack in tests: records what it would have sent, or fails.
export function createFakeNotifier({ failWith }: FakeNotifierOptions = {}): FakeNotifier {
  const sent: SentNotification[] = [];
  return {
    sent,
    async notify(webhookUrl, message) {
      if (failWith !== undefined) throw new NotificationError(failWith);
      sent.push({ webhookUrl, message: { ...message } });
    },
  };
}
