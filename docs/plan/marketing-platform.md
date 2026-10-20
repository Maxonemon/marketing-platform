# AI Marketing Automation Platform — Plan

Decisions already made:
- Audience: my own business / marketing agency (internal tool first)
- Automation: human approval before anything is published or sent
- Budget: low, essential paid APIs only

AI Marketing Automation Platform — Implementation Blueprint
Build this as an internal tool for your business or marketing agency first. The goal is to automate repetitive marketing work while keeping you in control of every public-facing action.
The platform will have specialized AI agents, scheduled monitoring, an orchestration layer, and a human approval queue. Start with a small number of integrations and add complexity only when the core workflow is reliable.
1. Architecture
Next.js dashboard
Brand settings · tasks · approvals · reports

Workflow orchestrator
Receives events, schedules work, routes tasks and handles retries

Research agent
Competitor pages, offers, changes and insights

Content agent
Social posts, ad copy, headlines and variations

Lead agent
Landing-page drafts, lead magnets and email sequences

Approval service
Review, approve, reject and audit actions

Neon PostgreSQL + Prisma
Brands, tasks, drafts, approvals, monitoring history and logs

Important design choice: agents should propose actions, not directly publish or send things. A separate execution service checks approval status before calling an external API.
2. Recommended stack
Layer	Choice	Purpose
Frontend	Next.js App Router + TypeScript	Dashboard and API endpoints
UI	Tailwind CSS + shadcn/ui	Fast, consistent interface
Database	Neon PostgreSQL + Prisma	Persistent application data
Authentication	Better Auth	Sign-in and user sessions (ADR-0002)
AI	One model API initially	Research analysis, writing and structured outputs
Workflows	Inngest	Scheduled jobs, retries, background tasks
Validation	Zod	Validate AI outputs and API inputs
Notifications	Slack webhook	Approval and monitoring alerts
Web monitoring	Playwright + HTTP requests	Inspect permitted public competitor pages
Email	Resend or another provider	Transactional notifications initially
Use one AI provider at first, rather than paying for multiple models. Keep the AI calls behind a small provider interface so you can change providers later.
For the first version, do not build a complex multi-agent framework. Use ordinary TypeScript functions with explicit inputs and outputs. Add LangGraph or a similar framework only if workflows genuinely require complex stateful branching.
3. Database schema
Design the database around a workspace. A workspace can represent your own business or an agency, and each workspace can manage multiple brands or clients.
The core data flow is:
Workspace → Brand → Workflow → AgentTask → Approval → Execution → ActivityLog
Main models and their responsibilities
Model	Stores
User	Login identity
Workspace	Your business or agency
WorkspaceMember	Users and their permissions
Brand	Brand voice, audience, offers and rules
Competitor	Public competitor URLs to monitor
CompetitorSnapshot	Historical observations and changes
WorkflowSchedule	Recurring research or content jobs
AgentTask	Work assigned to a specialized agent
ContentAsset	Generated posts, ads, headlines and email drafts
Approval	Approval decisions and proposed actions
Integration	Slack, email and future marketing connections
ActivityLog	Auditable events, errors and execution results
Prisma schema
This is a practical starting schema for PostgreSQL. It includes the Auth.js database models and the core marketing automation entities. You can add billing and multi-tenant SaaS features later if you decide to turn the internal tool into a product.

See `docs/plan/schema-draft.prisma`.

Schema notes before running migrations
- Store API credentials encrypted, never as plain text in settings. credentialsEnc needs authenticated encryption and a key held in your server environment.
- The Approval.payload should contain the exact proposed action, including the final text and target platform. payloadHash helps detect changes after approval.
- Add database constraints or server-side checks so only authorized workspace members can view or mutate workspace records. Prisma relations alone do not enforce tenant isolation.
- Keep competitor snapshots and logs bounded; retaining every full page forever will inflate storage.
- The IntegrationType enum is intentionally small. Add platform-specific types only when you implement them.
4. How the specialized agents work
Keep each agent focused on one responsibility. Agents should return structured data rather than free-form instructions to other agents.

Agent 1 — Competitor Research
Trigger: scheduled check or manual request
1. Fetch permitted public competitor pages.
2. Extract prices, offers, headlines and relevant changes.
3. Compare the new snapshot with the previous one.
4. Use AI to summarize the business impact.
5. Create a task and notify you when a meaningful change occurs.
Output: structured findings, evidence URLs, detected changes and recommendations.

Agent 2 — Content Creation
Trigger: manual request, schedule or research insight
1. Load the brand voice, audience, offer and content rules.
2. Generate posts, headlines or ad copy.
3. Generate three variants when useful.
4. Run checks for missing claims, prohibited wording and brand-rule violations.
5. Save drafts and create an approval request.
Output: editable content drafts with platform, variant and supporting context.

Agent 3 — Lead Campaigns
Trigger: campaign request or performance review
1. Draft a lead magnet, landing-page copy, form fields and email sequence.
2. Save the assets as drafts.
3. Later, connect analytics to measure sign-ups and conversion rates.
4. Suggest improvements when performance is weak.
Output: a proposed campaign, not a live page or outgoing email.

Agent 4 — Orchestrator
Receives events and dispatches the right workflow. For example, a competitor price change can trigger research analysis, which then requests new ad-copy variants.
It should route tasks, not autonomously execute arbitrary actions generated by an AI model.

5. Human approval workflow
This is the most important part of the system. Approval should be a technical enforcement mechanism, not just a button in the UI.
Flow: trigger → create AgentTask → run agent → validate output → save draft + proposed action → Approval PENDING → notify → human decides → (reject: log reason) / (approve: verify permissions + payloadHash → execute → log result; on failure: log error + notify)

Enforce these rules in the server:
- No approval, no publishing or sending.
- Approving one version must not approve a later-edited version. If the content changes, create a new approval request.
- Verify workspace access, approval status and payload hash immediately before execution.
- Prevent duplicate execution with an idempotency key or equivalent database-backed execution record.
- Log who approved the action, what was approved, when it was executed and the result.
- Require fresh approval after material changes to content, audience, recipient list or campaign settings.
For the MVP, allow approvals only from authenticated users in the correct workspace. Slack can notify reviewers, but your server should remain responsible for validating the decision.
6. Scheduled workflows and background jobs
Use Inngest for durable background jobs and retries. Do not run long-running research or AI generation directly inside a user-facing Next.js request.
Workflow	Suggested initial schedule	Result
Competitor monitoring	Daily	Snapshots and change alerts
Content generation	On demand	Drafts and approval requests
Content review	On demand	Quality checks and revised drafts
Campaign performance review	Weekly, once analytics exists	Recommendations
Approval reminders	Periodic	Reminder for pending decisions
Start with daily competitor monitoring rather than polling every few minutes. Respect website terms, rate limits and access restrictions.
A workflow should be resumable: if an AI call or external API fails, save the failure, retry appropriate transient errors, and avoid generating duplicate tasks or duplicate notifications.
7. Next.js API structure
Keep routes grouped by domain instead of putting all business logic into route handlers.
Route	Purpose
GET/POST /api/brands	List and create brands
GET/PATCH /api/brands/[id]	Read and update brand settings
GET/POST /api/competitors	Manage monitored competitors
POST /api/research/run	Start a research task
POST /api/content/generate	Generate content drafts
GET /api/tasks	View task history and status
GET /api/approvals	List pending approvals
POST /api/approvals/[id]/approve	Approve a proposed action
POST /api/approvals/[id]/reject	Reject a proposed action
POST /api/integrations/slack/test	Test Slack notifications
POST /api/inngest	Inngest event and function endpoint
Create reusable server-side modules such as:
src/
  app/
    dashboard/
    brands/
    approvals/
    tasks/
    api/
  lib/
    prisma.ts
    auth.ts
    permissions.ts
    ai/
      provider.ts
      research-agent.ts
      content-agent.ts
      lead-agent.ts
    workflows/
      orchestrator.ts
      approval-service.ts
      execution-service.ts
    integrations/
      slack.ts
      email.ts
    validation/
  inngest/
    client.ts
    functions.ts

Keep authorization, validation, approval checks and execution logic outside the UI components. Every route that reads or changes workspace data must check membership and permissions.
8. Implementation roadmap
Build the platform in four checkpoints. Do not integrate every marketing service at the start.
Build checklist
0 of 16 complete

Phase 1 — Foundation
Week 1

[ ] Set up Next.js, TypeScript, Neon and Prisma
[ ] Configure authentication and workspace permissions
[ ] Create brands and brand voice settings
[ ] Build dashboard, task history and activity logs

Phase 2 — Content and approvals
Week 2

[ ] Connect one AI provider
[ ] Generate content and three variants
[ ] Build the approval queue and rejection comments
[ ] Add Slack notifications and approval audit logs

Phase 3 — Research and scheduling
Week 3

[ ] Add competitor URL management
[ ] Capture and compare page snapshots
[ ] Schedule daily monitoring with Inngest
[ ] Generate evidence-based change summaries

Phase 4 — Safe execution
Week 4+

[ ] Add one publishing or email integration
[ ] Execute only approved payloads
[ ] Handle retries, duplicate prevention and failures
[ ] Add analytics and lead-campaign drafts

Treat these weeks as an achievable target for a focused MVP, not a guarantee. Integration approvals, API limitations and debugging may extend the schedule.
9. Keep the budget low
Start with the smallest useful paid footprint:
- Database: Neon free tier, subject to its current limits.
- AI: One provider, a cost-effective model for routine work, and a stronger model only for tasks that need it.
- Background jobs: Inngest free tier if your usage fits.
- Notifications: Slack incoming webhook for simple alerts.
- Monitoring: HTTP requests first; use Playwright only when a page requires browser rendering.
- Email and advertising: Delay paid integrations until the core workflow works. Use mock execution during development.
Control costs by limiting page size, scheduling frequency, AI output length and retries. Cache unchanged pages, avoid repeated analysis of identical snapshots, and record token usage and API costs per task.
Check current provider pricing and free-tier limits before deployment, because these can change.
10. Your first MVP acceptance criteria
The first version is ready when you can:
1. Create a workspace and configure a brand.
2. Add competitor URLs and run research manually or on a schedule.
3. See detected changes with source URLs and a useful AI summary.
4. Generate three content variants in the brand's voice.
5. Review, edit, approve or reject a proposed action.
6. Confirm that unapproved content cannot be published or sent, even through a direct API request.
7. See a complete history of tasks, decisions, errors and executions.
My recommendation: build Phase 1 and Phase 2 first. Use mock publishing, get the content-generation and approval workflow working reliably, and only then connect a real marketing platform. This delivers a useful internal tool without paying for integrations before you need them.