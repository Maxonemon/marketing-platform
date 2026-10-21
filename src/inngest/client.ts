import { eventType, Inngest } from "inngest";
import { z } from "zod";
import type { StartExecution } from "@/lib/app/approvals";
import type { StartTask } from "@/lib/app/content-requests";

// Dev mode (INNGEST_DEV=1) talks to the local Inngest Dev Server; otherwise the client
// needs INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY, checked at startup (src/lib/env.ts).
export const inngest = new Inngest({ id: "marketing-platform" });

// A member requested content: run the content Task in the background.
export const contentRequested = eventType("app/content.requested", {
  schema: z.object({ taskId: z.string().min(1) }),
});

export const sendContentRequested: StartTask = async (taskId) => {
  await inngest.send(contentRequested.create({ taskId }));
};

// An Approver approved a Proposed Action: execute it in the background. The execution
// service re-checks the Approval itself, so this event alone can't execute anything.
export const approvalApproved = eventType("app/approval.approved", {
  schema: z.object({ approvalId: z.string().min(1) }),
});

export const sendApprovalApproved: StartExecution = async (approvalId) => {
  await inngest.send(approvalApproved.create({ approvalId }));
};
