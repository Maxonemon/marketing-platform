# 06: Real AI provider and three Variants

**What to build:** Content requests now use a real AI model and return three Variants by default, written in the Brand's voice using its audience. Every AI call goes through the provider interface with a required max-token limit. Output that doesn't match the Zod schema fails the Task with a clear error and nothing half-formed is saved. Transient AI errors are retried a limited number of times. Each Task records its token usage and estimated cost.

Spec: [../spec.md](../spec.md) (stories 23–24, 26–27, 29–30).

**Blocked by:** 03 (Request content → Review)

**Status:** ready-for-agent

**Needs dependency approval first:** the AI provider SDK (default proposal: Anthropic, cost-effective model for routine content).

- [ ] The real provider implementation takes a prompt, a Zod schema and a required max-token limit, and returns validated output plus token usage
- [ ] The API key comes from env, is checked at startup and never logged
- [ ] The content agent asks for three Variants by default; the Review shows them side by side
- [ ] Invalid AI output → Task FAILED, no Content Assets saved, logged
- [ ] Transient errors retried a bounded number of times by the background function; permanent errors fail at once
- [ ] Task stores token usage and estimated cost; shown on Task detail
- [ ] Tests (fake provider): three Variants saved; invalid output fails the Task without saving; transient-then-success completes; token usage recorded. The real provider is not called in tests

**From ticket 04's review:**

- [ ] The spec's payload has "content (final text, plus title/subject where the content type has one)", but a Content Asset and the Proposed Action payload only have a body, so an Email has no subject line. Have the content agent write a subject for EMAIL (and a title where a content type needs one), store it on the Content Asset and add it to the payload as an optional field, so existing payload hashes stay valid.
