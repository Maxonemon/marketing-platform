# 12: Slack Integration: connect and test

**What to build:** An Owner or Admin connects a Slack Integration by pasting an incoming webhook URL and sends a test message to confirm it works. The webhook URL is stored encrypted, shown only masked, and never appears in logs, the Activity Log, API responses or error messages.

Spec: [../spec.md](../spec.md) (stories 67–69).

**Blocked by:** 01 (Sign in and create a Workspace)

**Status:** ready-for-agent

**Run `security-reviewer` before commit** (Integrations + credentials).

- [ ] Credential encryption uses authenticated symmetric encryption with a key from a server env var, checked at startup. It is a pure module with a round-trip unit test and a tamper-detection test
- [ ] Integration model stores credentials only in the encrypted field; only SLACK is implemented
- [ ] Connect/update/remove Slack operations (Owner/Admin), the webhook URL validated as an https Slack webhook, logged without the URL
- [ ] Test-message operation sends via plain HTTPS POST (no Slack SDK) through the Notifier interface; it has a fake for tests
- [ ] Integrations page shows the masked URL and a "send test" button with a success/failure result
- [ ] Tests: stored value is not the plaintext; a Member cannot connect; a test-message failure returns a clear error without the URL; no Activity Log entry contains the URL
