import { VARIANT_COUNT } from "@/lib/ai/content-agent";
import { createFakeAiProvider } from "@/lib/ai/fake-provider";
import { runContentTask } from "@/lib/app/content-requests";
import { createMockChannel } from "@/lib/channels/mock-channel";
import { executeApproval } from "@/lib/workflows/execution-service";
import { approvalApproved, contentRequested, inngest } from "./client";

// Until the real AI provider (ticket 06), the content agent gets this placeholder from
// the fake provider, so the whole flow can be tried without an AI bill.
const PLACEHOLDER_VARIANTS = {
  variants: Array.from({ length: VARIANT_COUNT }, (_, index) => ({
    subject: `Placeholder subject ${index + 1}`,
    body: `Placeholder Variant ${index + 1}, written by the fake AI provider.`,
  })),
};

// runContentTask records every failure on the Task itself. Inngest's default retries
// only help when the Task was never claimed (e.g. the database was briefly down); a
// retry of a Task already past QUEUED does nothing.
export const runContentTaskFunction = inngest.createFunction(
  { id: "run-content-task", triggers: [contentRequested] },
  async ({ event }) => {
    const ai = createFakeAiProvider(() => PLACEHOLDER_VARIANTS);
    await runContentTask(event.data.taskId, ai);
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
