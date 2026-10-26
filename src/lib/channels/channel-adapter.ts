import type { Channel } from "@/lib/content-options";
import type { ProposedActionPayload } from "@/lib/workflows/proposed-action-payload";

// One approved, hash-checked payload to carry out. Every attempt for the same Approval
// carries the same idempotency key, so a Channel can recognise a repeat; `attempt`
// counts from 1.
export interface Delivery {
  idempotencyKey: string;
  attempt: number;
  payload: ProposedActionPayload;
}

// What the Channel reports back, stored on the Execution. A type, not an interface, so
// it is assignable to a JSON column.
export type DeliveryResult = { deliveryId: string };

// A Channel throws this only when it is sure nothing went out, so the attempt can be
// retried. Any other error may have come after delivering (e.g. a timeout).
export class NotDeliveredError extends Error {
  override name = "NotDeliveredError";
}

// Publishes or sends on one Channel. Only the execution service calls it, and only
// after its checks pass. Throws when the delivery fails: NotDeliveredError when nothing
// went out, anything else when it may have.
export interface ChannelAdapter {
  deliver(delivery: Delivery): Promise<DeliveryResult>;
}

// One adapter per Channel, so adding a Channel without its adapter fails the build.
export type ChannelAdapters = Record<Channel, ChannelAdapter>;
