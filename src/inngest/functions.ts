import { createFakeAiProvider } from "@/lib/ai/fake-provider";
import { runContentTask } from "@/lib/app/content-requests";
import { contentRequested, inngest } from "./client";

// Until the real AI provider (ticket 06), the content agent gets this placeholder from
// the fake provider, so the whole flow can be tried without an AI bill.
const PLACEHOLDER_VARIANT =
  "Placeholder written by the fake AI provider. Real content arrives with the real AI provider (ticket 06).";

// runContentTask records every failure on the Task itself. Inngest's default retries
// only help when the Task was never claimed (e.g. the database was briefly down); a
// retry of a Task already past QUEUED does nothing.
export const runContentTaskFunction = inngest.createFunction(
  { id: "run-content-task", triggers: [contentRequested] },
  async ({ event }) => {
    const ai = createFakeAiProvider(() => ({ variants: [{ body: PLACEHOLDER_VARIANT }] }));
    await runContentTask(event.data.taskId, ai);
  },
);

export const functions = [runContentTaskFunction];
