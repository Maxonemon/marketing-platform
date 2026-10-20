# Spec: Foundation, content and approvals (Phases 1–2)

Status: ready-for-agent

Sources: `docs/plan/marketing-platform.md` (Phases 1 and 2), `GLOSSARY.md`, `docs/adr/0001-approve-immutable-proposed-actions-execute-separately.md`.

## Problem Statement

I run a business / marketing agency and spend too much time writing the same kinds of marketing content for each Brand by hand. I want AI to write it for me, but I can't let an AI publish or send anything on its own. One wrong post or email under a client's name is worse than no post at all. Tools I've tried either automate end to end with no real control, or bolt an "approve" button onto the UI that a direct API call or a later edit can get around. I also have no single place to see which content was produced, who decided what, and what actually went out.

## Solution

An internal web app where my team signs in to a Workspace, sets up each Brand's voice and rules, and asks for content. A content Task runs in the background and produces three Variants in the Brand's voice, each checked against the Brand's rules. A person opens the Review, picks one Variant and edits it if needed, then submits it. That turns it into a Proposed Action: an immutable snapshot of exactly what would go out, where, and to whom. An Approver (Owner or Admin) approves it, or rejects it with a comment. Only an Approved Proposed Action whose hash still matches can be executed, and only by the execution service. In these phases execution goes to a mock Channel, so the whole loop is real except for the final external call. Slack tells the team when something needs a decision or has failed. The Activity Log shows every decision, Execution and error, and nobody can edit it.

The first deliverable is a tracer bullet that runs end to end, thin but real: create a Brand → generate one post (mock AI) → Review → Approval → mock Execution → Activity Log.

## User Stories

### Sign-in and Workspace

1. As a new user, I want to sign up and sign in with my email and a password, so that I can start without setting up an external sign-in provider. (Changed from single sign-on at ticket 01, see ADR-0002.)
2. As a first-time user with no Workspace, I want to create a Workspace and become its Owner, so that I can start setting up my business or agency.
3. As a user, I want to be sent to sign-in when I open any app page while signed out, so that workspace data is never shown to anonymous visitors.
4. As a user who belongs to several Workspaces, I want to switch between them, so that I can work for different businesses without signing out.
5. As an Owner or Admin, I want to add a person by email with a role (Admin or Member), so that my team can use the Workspace.
6. As an invited person, I want to become a member the first time I sign in with the invited email, so that I don't need a separate acceptance step.
7. As an Owner, I want to change a member's role or remove them, so that access matches people's real responsibilities.
8. As an Owner, I want the system to stop me from removing or demoting the last Owner, so that a Workspace can never be left without an Owner.
9. As a member, I want to see only Workspaces I belong to, so that other businesses' data stays private.
10. As a member of Workspace A, I want any request for Workspace B's records to fail as "not found", even with a guessed ID, so that tenant isolation does not rely on the UI.
11. As a removed member, I want my access to stop immediately, including for Approvals I had not yet decided, so that former staff cannot act on the Workspace.

### Brands

12. As a member, I want to create a Brand with a name, website, industry and audience, so that content can be produced for it.
13. As an agency member, I want to create one Brand per client, so that each client's voice and rules stay separate.
14. As a member, I want to describe the Brand's voice in free text, so that generated content sounds like the Brand.
15. As a member, I want to list the Brand's offers and keywords, so that content can refer to them accurately.
16. As a member, I want to set Brand rules (prohibited words or phrases, required disclaimers), so that content that breaks them gets flagged.
17. As a member, I want invalid Brand settings rejected with a clear message for each field, so that I can fix them quickly.
18. As a member, I want to edit Brand settings later, so that the voice can change over time.
19. As a member, I want Brand settings changes recorded in the Activity Log, so that I can tell why content style changed.
20. As a member, I want to see all Brands in my Workspace on one page, so that I can move between them.

### Requesting content

21. As a member, I want to request content for a Brand by choosing a content type (social post, ad copy, email, headline), a target Channel and a short brief, so that the agent knows what to write.
22. As a member, I want the request to return straight away while the Task runs in the background, so that the page never hangs on an AI call.
23. As a member, I want each content request to produce three Variants by default, so that I have real alternatives to choose from.
24. As a member, I want Variants written in the Brand's voice using its audience, offers and keywords, so that they need little editing.
25. As a member, I want each Variant checked against the Brand rules, with violations shown on the Variant, so that I can see what needs fixing before I submit it.
26. As a member, I want AI output that does not match the expected structure to fail the Task with a clear error, never to be saved half-formed, so that I never review garbage.
27. As a member, I want a Task that hit a transient AI error to be retried automatically a limited number of times, so that brief outages don't need manual reruns.
28. As a member, I want a Task that failed for good to show its error and notify Slack, so that I know to act.
29. As a member, I want a hard maximum on generated output length, so that one request can't run up a large AI bill.
30. As an Owner, I want each Task to record its token usage and estimated cost, so that I can watch AI spend per Brand.
31. As a member, I want to cancel a queued Task, so that I don't pay for content I no longer need.

### Task history and dashboard

32. As a member, I want a Task history listing each Task's type, Brand, status, requester and timestamps, so that I can see what the agents have done.
33. As a member, I want to filter Task history by Brand and status, so that I can find a Task quickly.
34. As a member, I want to open a Task and see its input, result, error and attempts, so that I can understand what happened.
35. As a member, I want a dashboard showing open Reviews, Pending Approvals, recent failures and recent activity, so that I know what needs attention when I sign in.

### Review

36. As a member, I want a finished content Task to appear as a Review, so that I know it is waiting for me to pick a Variant.
37. As a member, I want to compare the three Variants side by side with their rule flags, so that I can pick the best one.
38. As a member, I want to edit the Variant I picked before submitting, so that I can fix small issues without regenerating.
39. As a member, I want rule checks to re-run on my edited text, so that an edit can't quietly add a prohibited phrase.
40. As a member, I want to submit the picked Variant for approval, so that it becomes a Proposed Action.
41. As a member, I want to set the audience or recipients (where the Channel needs them) when I submit, so that the Proposed Action captures exactly who it reaches.
42. As a member, I want to discard a Review without submitting anything, so that unwanted output does not clutter the queue.

### Proposed Actions and Approvals

43. As an Approver, I want each Proposed Action to show exactly the content, Channel, audience or recipients and timing that would be executed, so that I approve what will actually happen.
44. As an Approver, I want to see the Content Asset, Task and Brand rule flags behind a Proposed Action, so that I have context for my decision.
45. As an Approver, I want an approval queue of Pending Approvals in my Workspace, oldest first, so that nothing is missed.
46. As an Approver, I want to approve a Pending Approval, so that it becomes eligible for Execution.
47. As an Approver, I want to reject a Pending Approval with a required comment, so that the author knows what to change.
48. As a Member, I want the approve action to be unavailable to me and the server to refuse it, so that only Owners and Admins can approve.
49. As an Owner or Admin, I want to be able to approve a request I submitted myself, so that a small team is never blocked.
50. As a member, I want any attempt to decide an Approval that is no longer Pending to be refused, so that each decision is made once and is final.
51. As a member, I want two Approvers deciding at the same moment to produce exactly one decision, so that the record is never contradictory.
52. As a member, I want a Pending Approval nobody decided within 7 days to become Expired, so that stale content is never approved by accident.
53. As a member, I want Expired to be final, so that old content has to be resubmitted as a new Proposed Action.
54. As a member, I want editing the content after submission to create a new Proposed Action with a new Pending Approval and to mark the previous one Superseded, so that approving one version can never approve a later edit.
55. As a member, I want a change to the audience, recipients, Channel or timing to supersede the Approval in the same way, so that every material change gets a fresh decision.
56. As a member, I want an Approved Approval that has not yet executed successfully to be Superseded too when its content changes, so that the old version can't go out after an edit.
57. As a member, I want to resubmit content after a rejection as a new Proposed Action, so that the rejected one keeps its history unchanged.
58. As a member, I want the history of every Proposed Action for a Content Asset kept, so that the Activity Log shows what was first proposed as well as the final text.

### Execution (mock Channel)

59. As an Approver, I want approving to start an Execution in the background, so that the approve request returns quickly.
60. As a member, I want an Execution to go ahead only if, at that moment, the Approval is Approved and the Proposed Action's recomputed hash matches the stored one, so that tampered or superseded content never goes out.
61. As a member, I want a direct API call that tries to execute an unapproved, rejected, expired or superseded Proposed Action to fail, so that the guarantee holds outside the UI.
62. As a member, I want Executions to go to a mock Channel during these phases, which records exactly what it would have sent, so that I can prove the loop works without paying for integrations.
63. As a member, I want a failed Execution to be recorded with its error, retried with the same idempotency key, and reported to Slack, so that failures are visible and recoverable.
64. As a member, I want at most one successful Execution per Approval, even when retries overlap, so that nothing is ever published twice.
65. As a member, I want retrying the same Approved Proposed Action to need no new approval, so that a transient failure doesn't mean asking an Approver again.
66. As a member, I want to see each Approval's Executions (attempts, results, errors), so that I can tell whether it actually went out.

### Notifications

67. As an Owner or Admin, I want to connect a Slack Integration with an incoming webhook URL, so that the team gets alerts.
68. As an Owner or Admin, I want to send a test Slack message, so that I can confirm the Integration works.
69. As an Owner or Admin, I want the webhook URL stored encrypted and never shown in full or logged, so that a leaked log or page doesn't expose it.
70. As an Approver, I want a Slack message when a new Approval is Pending, linking to it in the app, so that I can decide promptly.
71. As a member, I want a Slack message when a Review is ready, a Task fails or an Execution fails, so that problems are not missed.
72. As a member, I want a Slack outage to never block or roll back a Task, Approval or Execution, so that notifications can't break the core flow.
73. As an Approver, I want approving to happen only in the authenticated app and never from a Slack button, so that the server stays in charge of the decision.

### Activity Log

74. As an Owner, I want every decision (approve, reject with comment, expire, supersede) logged with who, what, which Proposed Action and when, so that I can audit approvals.
75. As an Owner, I want every Execution attempt and its result logged, so that I can audit what went out.
76. As an Owner, I want Task failures, Integration errors and membership or role changes logged, so that the record is complete.
77. As an Owner, I want the Activity Log to be append-only with no way to edit or delete entries through the app, so that it can be trusted.
78. As a member, I want to browse and filter the Activity Log by event type, Brand and date, so that I can answer "what happened?" quickly.
79. As a member, I want the Activity Log never to contain credentials or secrets, so that browsing it is safe.

## Implementation Decisions

### Stack additions (each new dependency needs your approval at its ticket)
- Prisma with Neon PostgreSQL. The schema draft predates Prisma 7, so the database ticket must check the current Prisma setup (config file, generator, driver adapter) before writing the schema.
- Better Auth with database sessions and email + password sign-in (decided at ticket 01, see `docs/adr/0002-better-auth-email-password.md`). No email-link sign-in, verification or reset emails, so no email provider is needed in these phases.
- Inngest for background functions: content Tasks, Executions and the Approval expiry sweep.
- One AI provider SDK behind the provider interface. The default proposal is Anthropic, with a cost-effective model for routine content; confirm at the AI ticket.
- Slack uses a plain HTTPS POST to an incoming webhook. No Slack SDK.

### Modules
- **Permissions**: one module answers "is this user a member of this Workspace with at least role X?". Every application-layer operation that touches workspace data calls it first. A record outside the caller's Workspace looks exactly like a missing one ("not found").
- **Application layer**: one server-side operation per user intent, each taking the acting user and the Workspace. Routes and server actions only parse input, call one operation and map the result to HTTP or UI. This layer is the test seam. Indicative operations: create Workspace, add/change/remove member, create/update Brand, request content, cancel Task, get Review, pick-and-submit Variant, edit Content Asset (supersedes), approve, reject, list approval queue, list Tasks, list Activity Log, configure/test Slack Integration.
- **AI provider**: the only path to the model. It takes a prompt plus a Zod schema and a required max-token limit, returns validated structured output and token usage, and fails if validation fails. A fake implementation is used in tests and the tracer bullet.
- **Content agent**: a plain function. Brand settings and the brief go in; a Zod-validated list of Variants comes out. It never writes to the database and never calls anything except the AI provider.
- **Brand rule checker**: a pure function over text and Brand rules that returns violations (prohibited phrase found, required disclaimer missing). Violations are warnings shown in the Review and on the Approval. They don't block submission; the Approver decides.
- **Approval service**: creates a Proposed Action and its Pending Approval, decides (approve or reject), supersedes on material change, and expires. A status change uses a conditional update ("only if still Pending", and for supersede "only if not successfully executed") inside a transaction, so concurrent decisions resolve to exactly one.
- **Execution service**: the only module that executes. Immediately before calling a Channel it re-reads the Approval and Proposed Action, checks the status is APPROVED and not Superseded, recomputes the payload hash and compares it, and records an Execution attempt. Phase 2 ships only a mock Channel.
- **Channel adapter interface**: takes the Proposed Action and returns the result or an error. The mock implementation records what it would have sent and can be told to fail, for tests.
- **Notifier interface**: Slack implementation plus a fake. Calls are best effort: a failure is logged to the Activity Log as an Integration error and never rethrown into the main flow.
- **Clock**: an injected time source so that 7-day expiry and timestamps can be tested.
- **Credential encryption**: authenticated symmetric encryption with a key from a server environment variable that is checked at startup. Decrypted values never reach logs, the Activity Log, API responses or error messages.
- **Activity Log writer**: one append function. There are no update or delete operations in code.

### Schema (diverges from the draft as ADR-0001 requires)
- Approval status: PENDING, APPROVED, REJECTED, EXPIRED, SUPERSEDED. Remove EXECUTED and EXECUTION_FAILED, along with the Approval's execution fields.
- New **Proposed Action** model. It is immutable once written and has no update path. It holds Workspace, Brand, source Content Asset, Channel, content snapshot, audience/recipients, timing, canonical payload, payload hash and created-by. Every edit adds a row; that is intended.
- **Approval** points to exactly one Proposed Action (one-to-one). It stores status, decider, decision time, comment (required for REJECTED), expiresAt (created + 7 days) and supersededBy (the newer Approval).
- New **Execution** model: Approval, idempotency key, attempt number, status (STARTED, SUCCEEDED, FAILED), result, error, timestamps. A database constraint allows at most one SUCCEEDED Execution per Approval. All attempts for one Approval share one idempotency key derived from the Approval.
- Task statuses: QUEUED, RUNNING, IN_REVIEW, COMPLETED, FAILED, CANCELLED. Replace WAITING_APPROVAL with IN_REVIEW, because approval belongs to the Proposed Action, not to the Task. A Task becomes COMPLETED when its Review is submitted or discarded. Add token usage and cost fields.
- Content Asset keeps a Variant number and belongs to its Task. Editing changes the Content Asset; it never changes a Proposed Action.
- Workspace invitation: a pending (Workspace, email, role) record, consumed at first sign-in with that email.
- Integration stores credentials only in the encrypted field. Phase 2 implements only SLACK. The mock Channel needs no Integration.
- Activity Log entries: Workspace, actor (user or system), event type, subject references (Task / Proposed Action / Approval / Execution / Brand) and non-secret details.
- Campaign, Competitor, Monitored Page, Snapshot, Change, Finding and Schedule models are not built in these phases.

### Proposed Action payload and hash
- The payload is a canonical, deterministically serialized object: Channel, content (final text, plus title/subject where the content type has one), audience/recipients, timing and content type. The hash is SHA-256 over that serialization.
- "Material change" means any change to a field in the payload. Changing any of them produces a new Proposed Action.
- Timing in these phases is always "as soon as approved". Scheduled future times are out of scope but are kept as a payload field so that adding them later is a material change.

### Background flow
- Request content → create a QUEUED Task → send an Inngest event → the function runs the content agent → save the Variants as Content Assets → the Task becomes IN_REVIEW → notify. AI calls never happen inside a request handler.
- Approve → send an Inngest event → the function calls the execution service. Retries keep the same idempotency key. A final failure is logged and notified.
- The expiry sweep is a periodic Inngest function that marks overdue Pending Approvals EXPIRED. Deciding also re-checks expiry, so an overdue Approval can't be approved before the sweep runs.

### UI
- Server-rendered pages: sign-in, Workspace picker/creation, members, Brands list and settings, request content, Task history and detail, Review (Variants side by side, edit, submit), approval queue and detail, Integrations (Slack), Activity Log, dashboard.
- Approve and reject controls appear only for Approvers, but the server enforces the rules whatever the UI shows.

## Testing Decisions

- **What a good test is**: it drives the system through the application layer the way a route would (acting user, Workspace, input) and asserts on the outcome: return values, stored records read back through other application-layer operations, the Activity Log, and what the fakes received. It doesn't assert on internal calls, query shapes or private helpers. Tests must survive refactors that keep behavior the same.
- **One seam**: the application layer, tested against a real PostgreSQL test database (a dedicated Neon test branch or a local Postgres, reset between tests) with migrations applied. This is required because tenant isolation, the at-most-one-SUCCEEDED-Execution constraint and conditional status updates are enforced in the database.
- **Fakes at the external edges only**: AI provider (returns given structured output or an error), Channel (mock that records and can fail), Notifier (records messages and can fail), Clock (settable). Background functions are called directly in tests; Inngest is not run.
- **Required scenarios**:
  - the tracer bullet end to end
  - cross-Workspace access returns not-found for every operation
  - a Member cannot approve
  - self-approval is allowed
  - reject without a comment is refused
  - deciding a non-Pending Approval is refused
  - concurrent approve/reject gives exactly one decision
  - expiry after 7 days via the Clock, and approving after 7 days fails even before the sweep
  - an edit supersedes Pending and Approved-not-executed Approvals
  - executing an unapproved, rejected, expired or superseded Proposed Action fails
  - a tampered payload (hash mismatch) fails
  - concurrent or retried Executions produce at most one success
  - a Slack failure doesn't break the flow
  - invalid AI output fails the Task
  - no secret appears in the Activity Log or in error results
- **Pure-function unit tests** are allowed for the Brand rule checker, payload canonicalization/hash and credential encryption round-trip, because these are deep modules with a small interface.
- **HTTP**: only a few smoke tests showing that routes reject unauthenticated requests and map application-layer errors to the right status codes.
- **Prior art**: the existing Vitest setup and the placeholder approval-rules test (`pnpm vitest run <file>`). That placeholder's `canExecute` is replaced by the approval and execution services, and its behavior (only APPROVED executes) carries into the new tests. Under the project rules it must not be weakened in the meantime.

## Out of Scope

- Phase 3: Competitors, Monitored Pages, Snapshots, Changes, Findings, Schedules, Playwright monitoring.
- Phase 4: any real publishing or sending Integration (LinkedIn, Meta ads, email lists), analytics, the lead agent, Campaigns and lead magnets / landing pages / email sequences.
- Scheduled (future-dated) Proposed Actions; approval reminders.
- Approving or rejecting from Slack (Slack only notifies).
- Email-link sign-in and invitation emails.
- A Review-stage regenerate/refine loop beyond requesting a new Task.
- Billing, multi-tenant SaaS signup, rate limiting beyond what the framework provides.
- Choosing between multiple AI providers or models at runtime.

## Further Notes

- `/setup-matt-pocock-skills` has not been run. This spec follows the README's instruction to use the Local markdown tracker in `.scratch/` with the default triage labels.
- The first ticket from `/to-tickets` should be the tracer bullet. It needs the database, auth, permissions, application layer, fake AI provider, approval and execution services and the mock Channel at minimum depth. Later tickets add depth (real AI provider, three Variants with rule checks, Slack, expiry, supersede, UI polish).
- Several tickets need dependency approval before they can start: Prisma/Neon adapter, Better Auth, Inngest, the AI SDK. The test database also needs a `DATABASE_URL` for tests.
- Tickets touching auth, approvals, execution or Integrations must also go through the `security-reviewer` agent, as set out in CLAUDE.md.
- Retention limits on the Activity Log and Snapshots apply from Phase 3 and are not addressed here.
