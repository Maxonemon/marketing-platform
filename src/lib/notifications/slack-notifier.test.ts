import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationError } from "./notifier";
import { createSlackNotifier } from "./slack-notifier";

const WEBHOOK_URL = "https://hooks.slack.com/services/T0001/B0001/abcdefghijklmnopqrstuvwx";

// Fetch is the external edge here: stubbed, nothing reaches Slack.
function stubFetch(respond: () => Promise<Response>) {
  const fetchMock = vi.fn<typeof fetch>(() => respond());
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("the Slack notifier", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the message as JSON to the webhook URL, without following redirects", async () => {
    const fetchMock = stubFetch(async () => new Response("ok", { status: 200 }));

    await createSlackNotifier().notify(WEBHOOK_URL, { text: "Hello from the app" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(WEBHOOK_URL);
    expect(init).toMatchObject({ method: "POST", redirect: "error", headers: { "Content-Type": "application/json" } });
    expect(JSON.parse(String(init?.body))).toEqual({ text: "Hello from the app" });
  });

  it("reports a refused message with its HTTP status, not the URL or Slack's reply", async () => {
    stubFetch(async () => new Response(`invalid_token for ${WEBHOOK_URL}`, { status: 403 }));

    const sent = createSlackNotifier().notify(WEBHOOK_URL, { text: "Hello" });

    await expect(sent).rejects.toThrow(NotificationError);
    await expect(sent).rejects.toThrow("Slack refused the message (HTTP 403).");
  });

  it("reports a network failure without the URL from the underlying error", async () => {
    stubFetch(async () => {
      throw new TypeError(`fetch failed: getaddrinfo ENOTFOUND ${WEBHOOK_URL}`);
    });

    const sent = createSlackNotifier().notify(WEBHOOK_URL, { text: "Hello" });

    await expect(sent).rejects.toThrow(NotificationError);
    await expect(sent).rejects.toThrow(expect.objectContaining({ message: expect.not.stringContaining("hooks.slack.com") }));
  });
});
