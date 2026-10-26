# 12: Slack Integration: connect and test

**What to build:** An Owner or Admin connects a Slack Integration by pasting an incoming webhook URL and sends a test message to confirm it works. The webhook URL is stored encrypted, shown only masked, and never appears in logs, the Activity Log, API responses or error messages.

Spec: [../spec.md](../spec.md) (stories 67–69).

**Blocked by:** 01 (Sign in and create a Workspace)

**Status:** done, closed (2026-10-26). Verified by `pnpm check`: typecheck, lint and 255 tests in 23 files. 254 passed; the one failure, in `content-assets.test.ts` (not touched by this ticket), was the Neon connect timeout, and that file passes 18/18 with `--network-family-autoselection-attempt-timeout=2000`. Reviewed by `reviewer`, `security-reviewer` and the code-review skill; their findings are listed below, none fixed yet. No browser run. The key is `CREDENTIALS_ENCRYPTION_KEY` (32 random bytes, base64), checked at startup. The sealed value is bound to its Workspace, so a copy in another row can't be decrypted. The webhook URL must be exactly `https://hooks.slack.com/services/<a>/<b>/<c>`, and the page shows it masked as `https://hooks.slack.com/services/…` plus its last 4 characters. A test message is logged as `INTEGRATION_TESTED`, with the safe error when it failed.

**Run `security-reviewer` before commit** (Integrations + credentials).

- [x] Credential encryption uses authenticated symmetric encryption with a key from a server env var, checked at startup. It is a pure module with a round-trip unit test and a tamper-detection test
- [x] Integration model stores credentials only in the encrypted field; only SLACK is implemented
- [x] Connect/update/remove Slack operations (Owner/Admin), the webhook URL validated as an https Slack webhook, logged without the URL
- [x] Test-message operation sends via plain HTTPS POST (no Slack SDK) through the Notifier interface; it has a fake for tests
- [x] Integrations page shows the masked URL and a "send test" button with a success/failure result
- [x] Tests: stored value is not the plaintext; a Member cannot connect; a test-message failure returns a clear error without the URL; no Activity Log entry contains the URL

**Left open (review findings not fixed):**

- The Slack Notifier posts to any URL it is given: only connecting checks that it is a Slack webhook URL. Ticket 13 adds more callers, so the Notifier should check again before each send.
- The test button has no rate limit: an Admin can post to the channel repeatedly, and each press adds an Activity Log entry.
- The Slack Notifier never reads or cancels Slack's response body, which can keep the connection busy until garbage collection.
- The masked URL shows the last 4 of about 24 secret characters.
- Two first connects at the same moment can both be logged as connected (still one row).
- No key rotation: changing `CREDENTIALS_ENCRYPTION_KEY` makes stored URLs unreadable until they are pasted again (the page says so).
- The test message is logged after it is sent: if that write fails, the user sees an error although Slack got the message.
- Code-review smells: the three forms repeat their setup; `"SLACK"` repeats; the Slack helpers (URL check, mask, escaping) could move out of `integrations.ts`; `saved` also means "sent"; the page checks `role === "MEMBER"` itself.
