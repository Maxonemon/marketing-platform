import type { Execution } from "@/generated/prisma/client";
import { appendActivity } from "@/lib/app/activity-log";
import type { ChannelAdapter, ChannelAdapters, Delivery, DeliveryResult } from "@/lib/channels/channel-adapter";
import { db } from "@/lib/db";
import { verifyPayload } from "./proposed-action-payload";

export type ExecutionRefusal =
  // No such Approval.
  | "NOT_FOUND"
  // Pending, Rejected, Expired or Superseded: only an Approved Proposed Action executes.
  | "NOT_APPROVED"
  // The stored payload no longer matches the hash it was proposed and approved with.
  | "PAYLOAD_CHANGED"
  // An attempt was already made (e.g. a duplicate event). Retries come with ticket 10.
  | "ALREADY_ATTEMPTED";

export type ExecutionOutcome =
  | { status: "SUCCEEDED"; executionId: string }
  | { status: "REFUSED"; reason: ExecutionRefusal };

// What a failed attempt records. Never the Channel's own error, which could carry
// credentials once real Integrations exist.
export const DELIVERY_FAILED = "The Channel couldn't deliver it.";

// One attempt per Approval until retries arrive (ticket 10).
const FIRST_ATTEMPT = 1;

// Shared by every attempt for the same Approval, so a Channel can recognise a repeat.
function idempotencyKeyFor(approvalId: string): string {
  return `approval:${approvalId}`;
}

// The only code that executes a Proposed Action; the background function calls it with
// the Approval's id. Immediately before calling the Channel it re-reads the Approval and
// its Proposed Action, refuses unless the Approval is APPROVED and the recomputed payload
// hash matches the stored one, and records the attempt. Only the re-validated payload
// is sent, never the raw stored JSON.
export async function executeApproval(approvalId: string, channels: ChannelAdapters): Promise<ExecutionOutcome> {
  const approval = await db.approval.findUnique({ where: { id: approvalId }, include: { proposedAction: true } });
  if (!approval) return refused("NOT_FOUND");
  if (approval.status !== "APPROVED") return refused("NOT_APPROVED");
  const { proposedAction } = approval;
  const payload = verifyPayload(proposedAction.payload, proposedAction.payloadHash);
  if (!payload) return refused("PAYLOAD_CHANGED");
  const delivery: Delivery = { idempotencyKey: idempotencyKeyFor(approvalId), payload };
  // The unique (approvalId, attempt) makes this a claim: a second run creates nothing.
  const [execution] = await db.execution.createManyAndReturn({
    data: [{ approvalId, idempotencyKey: delivery.idempotencyKey, attempt: FIRST_ATTEMPT }],
    skipDuplicates: true,
  });
  if (!execution) return refused("ALREADY_ATTEMPTED");
  const result = await deliverOrRecordFailure(execution, channels[payload.channel], delivery);
  await db.$transaction(async (tx) => {
    await tx.execution.update({
      where: { id: execution.id },
      data: { status: "SUCCEEDED", result, finishedAt: new Date() },
    });
    await appendActivity(tx, {
      workspaceId: proposedAction.workspaceId,
      actor: "system",
      brandId: proposedAction.brandId,
      approvalId,
      event: "EXECUTION_SUCCEEDED",
      details: { channel: payload.channel, attempt: execution.attempt },
    });
  });
  return { status: "SUCCEEDED", executionId: execution.id };
}

function refused(reason: ExecutionRefusal): ExecutionOutcome {
  return { status: "REFUSED", reason };
}

// A failed delivery marks the attempt FAILED with a safe message and is rethrown, so
// the background runner records the details. Logging and retrying it come with ticket 10.
async function deliverOrRecordFailure(
  execution: Execution,
  channel: ChannelAdapter,
  delivery: Delivery,
): Promise<DeliveryResult> {
  try {
    return await channel.deliver(delivery);
  } catch (error: unknown) {
    await db.execution.update({
      where: { id: execution.id },
      data: { status: "FAILED", error: DELIVERY_FAILED, finishedAt: new Date() },
    });
    throw error;
  }
}
