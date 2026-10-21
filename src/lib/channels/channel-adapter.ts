import type { Channel } from "@/lib/content-options";
import type { ProposedActionPayload } from "@/lib/workflows/proposed-action-payload";

// One approved, hash-checked payload to carry out. Every attempt for the same Approval
// carries the same idempotency key, so a Channel can recognise a repeat.
export interface Delivery {
  idempotencyKey: string;
  payload: ProposedActionPayload;
}

// What the Channel reports back, stored on the Execution. A type, not an interface, so
// it is assignable to a JSON column.
export type DeliveryResult = { deliveryId: string };

// Publishes or sends on one Channel. Only the execution service calls it, and only
// after its checks pass. Throws when the delivery fails.
export interface ChannelAdapter {
  deliver(delivery: Delivery): Promise<DeliveryResult>;
}

// One adapter per Channel, so adding a Channel without its adapter fails the build.
export type ChannelAdapters = Record<Channel, ChannelAdapter>;
