import { VARIANT_COUNT } from "@/lib/ai/content-agent";
import { createFakeAiProvider } from "@/lib/ai/fake-provider";
import { runContentTask } from "@/lib/app/content-requests";
import { createMockChannel } from "@/lib/channels/mock-channel";
import { executeApproval } from "@/lib/workflows/execution-service";
import { approvalApproved, contentRequested, inngest } from "./client";

// Until the real AI provider is wired in (ticket 06 part B), the content agent gets
// this placeholder from the fake provider, so the whole flow can be tried without a bill.
const PLACEHOLDER_VARIANTS = {
  variants: Array.from({ length: VARIANT_COUNT }, (_, index) => ({
    subject: `Placeholder subject ${index + 1}`,
    body: `Placeholder Variant ${index + 1}, written by the fake AI provider.`,
  })),
};

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
    const ai = createFakeAiProvider(() => PLACEHOLDER_VARIANTS);
    const outcome = await runContentTask(event.data.taskId, ai, { isFinalAttempt: attempt + 1 >= maxAttempts });
    if (outcome === "RETRY") throw new ContentTaskRetry("Transient AI error: the content Task will be retried.");
  },
);

// Until real Integrations (Phase 4) every Channel is the mock one, which records what it
// would have sent and publishes nothing. The outcome (succeeded, or refused and why) is
// the run's output in Inngest. A retry after an attempt was claimed is refused as
// ALREADY_ATTEMPTED, so nothing is delivered twice; real retries come with ticket 10.
export const executeApprovalFunction = inngest.createFunction(
  { id: "execute-approval", triggers: [approvalApproved] },
  async ({ event }) => executeApproval(event.data.approvalId, { MOCK: createMockChannel() }),
);

export const functions = [runContentTaskFunction, executeApprovalFunction];
