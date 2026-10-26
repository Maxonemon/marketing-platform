import { NotificationError, type Notifier } from "./notifier";

// Slack answers within a few seconds or not at all.
const SLACK_TIMEOUT_MS = 10_000;

// A plain HTTPS POST to the incoming webhook: no Slack SDK. Redirects are refused, so a
// validated hooks.slack.com URL can't lead the request anywhere else. Errors are mapped
// to fixed messages: the URL is in the request, and fetch's own errors may repeat it.
export function createSlackNotifier(): Notifier {
  return {
    async notify(webhookUrl, message) {
      let response: Response;
      try {
        response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: message.text }),
          redirect: "error",
          signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
        });
      } catch {
        throw new NotificationError("Slack couldn't be reached. Try again in a moment.");
      }
      if (!response.ok) throw new NotificationError(`Slack refused the message (HTTP ${response.status}).`);
    },
  };
}
