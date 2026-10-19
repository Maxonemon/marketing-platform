# 07: Brand rules and rule checks

**What to build:** On Brand settings, a member adds offers, keywords, prohibited words/phrases and required disclaimers. The content agent uses offers and keywords. Each Variant is checked against the Brand rules, and violations (prohibited phrase found, required disclaimer missing) show as warnings on the Variant in the Review and on the Approval. Warnings never block submission; the Approver decides.

Spec: [../spec.md](../spec.md) (stories 15–16, 25).

**Blocked by:** 03 (Request content → Review)

**Status:** ready-for-agent

- [ ] Brand settings accept offers, keywords, prohibited phrases and required disclaimers (Zod-validated); changes are logged
- [ ] The Brand rule checker is a pure function (text + rules → violations) with unit tests: case-insensitive match, multiple violations, missing disclaimer, clean text
- [ ] Violations are stored with each Variant and shown in the Review and on the Approval
- [ ] Offers and keywords are passed to the content agent
- [ ] Tests: a Task whose fake AI output contains a prohibited phrase produces a Variant with that violation; submission with violations is still allowed and the Approval shows them
