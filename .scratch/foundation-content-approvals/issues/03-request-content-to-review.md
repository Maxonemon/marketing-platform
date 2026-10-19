# 03: Request content → Review (tracer bullet, part 1)

**What to build:** On a Brand, a member requests a social post (content type, target Channel, short brief). The request returns at once with a QUEUED Task. A background function runs the content agent through a **fake** AI provider, saves one Variant as a Content Asset and moves the Task to IN_REVIEW. The member sees the Task in Task history and opens the Review, which shows the Variant. AI calls never run inside a request handler.

Spec: [../spec.md](../spec.md) (stories 21–22, 32, 34, 36). This is the first half of the tracer bullet.

**Blocked by:** 02 (Brands and the Activity Log)

**Status:** ready-for-agent

**Needs dependency approval first:** Inngest.

- [ ] The request-content operation validates input, creates a QUEUED Task and sends an Inngest event; no AI call happens in the request
- [ ] The background function marks the Task RUNNING, calls the content agent, saves the Content Asset(s) and marks the Task IN_REVIEW. On error it marks the Task FAILED with the error, and the failure goes to the Activity Log
- [ ] The content agent is a plain function: Brand settings + brief in, Zod-validated Variants out. It never touches the database
- [ ] The AI provider interface exists with a fake implementation (the real one comes in 06)
- [ ] Task statuses: QUEUED, RUNNING, IN_REVIEW, COMPLETED, FAILED, CANCELLED
- [ ] Task history page (type, Brand, status, requester, timestamps) and Task detail page (input, result, error)
- [ ] Review page shows the Variant(s) of an IN_REVIEW Task
- [ ] Tests (the background function is called directly, no Inngest runtime): request → run → Task IN_REVIEW with one Content Asset; fake AI error → Task FAILED + Activity Log entry; cross-Workspace request/read is not-found
