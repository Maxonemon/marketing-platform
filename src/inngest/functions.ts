import { createAiProvider } from "@/lib/ai/create-provider";
import { expireOverdueApprovals } from "@/lib/app/approvals";
import { runContentTask } from "@/lib/app/content-requests";
import { createMockChannel } from "@/lib/channels/mock-channel";
import { aiEnv, mockChannelEnv } from "@/lib/env";
import { DELIVERY_FAILED, executeApproval, reconcileExecutions } from "@/lib/workflows/execution-service";
import { approvalApproved, contentRequested, inngest, sendApprovalApproved } from "./client";

// A transient AI error (rate limit, outage) is retried this many times, with Inngest's
// backoff between attempts; any other failure is recorded on the Task at once.
export const CONTENT_TASK_RETRIES = 2;

class ContentTaskRetry extends Error {
  override name = "ContentTaskRetry";
}

// runContentTask records every failure on the Task itself, except a transient AI error
// while retries remain: it hands the Task back as QUEUED and this function throws, so
// Inngest runs it again. Inngest's retries also cover a Task that was never claimed
// (e.g. the database was briefly down); a retry of a Task past QUEUED does nothing.
export const runContentTaskFunction = inngest.createFunction(
  { id: "run-content-task", triggers: [contentRequested], retries: CONTENT_TASK_RETRIES },
  async ({ event, attempt, maxAttempts = CONTENT_TASK_RETRIES + 1 }) => {
    const ai = createAiProvider(aiEnv());
    const outcome = await runContentTask(event.data.taskId, ai, { isFinalAttempt: attempt + 1 >= maxAttempts });
    if (outcome === "RETRY") throw new ContentTaskRetry("Transient AI error: the content Task will be retried.");
  },
);

// Each try of the function is one attempt, so it retries MAX_EXECUTION_ATTEMPTS - 1
// times (a literal, as Inngest's type asks). The execution service bounds attempts itself.
export const EXECUTION_RETRIES = 2;

class ExecutionRetry extends Error {
  override name = "ExecutionRetry";
}

// Until real Integrations (Phase 4) every Channel is the mock one, which records what it
// would have sent and publishes nothing; MOCK_CHANNEL_FAILED_ATTEMPTS makes its first
// attempts fail, to try retries in dev. The outcome is the run's output in Inngest. A
// failed attempt with retries left throws only the service's safe message, never the
// Channel's error, so Inngest runs it again with its backoff; a duplicate event or an
// overlapping retry is refused by the service, so nothing is delivered twice.
export const executeApprovalFunction = inngest.createFunction(
  { id: "execute-approval", triggers: [approvalApproved], retries: EXECUTION_RETRIES },
  async ({ event }) => {
    const channel = createMockChannel({ failedAttempts: mockChannelEnv().failedAttempts });
    const outcome = await executeApproval(event.data.approvalId, { MOCK: channel });
    if (outcome.status === "FAILED" && outcome.willRetry) throw new ExecutionRetry(DELIVERY_FAILED);
    return outcome;
  },
);

// Every 15 minutes, expire the Pending Approvals past their 7-day deadline. Deciding
// re-checks the deadline itself, so this only keeps statuses and the queue current; the
// count expired is the run's output in Inngest.
export const expireApprovalsFunction = inngest.createFunction(
  { id: "expire-overdue-approvals", triggers: [{ cron: "*/15 * * * *" }] },
  async () => ({ expired: await expireOverdueApprovals() }),
);

// Every 15 minutes, start the Execution of Approved Approvals whose event was never sent,
// and mark attempts left STARTED as UNCERTAIN; the counts are the run's output in Inngest.
export const reconcileExecutionsFunction = inngest.createFunction(
  { id: "reconcile-executions", triggers: [{ cron: "*/15 * * * *" }] },
  async () => reconcileExecutions(sendApprovalApproved),
);

export const functions = [runContentTaskFunction, executeApprovalFunction, expireApprovalsFunction, reconcileExecutionsFunction];
