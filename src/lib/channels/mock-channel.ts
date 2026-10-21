import { randomUUID } from "node:crypto";
import type { ChannelAdapter, Delivery } from "./channel-adapter";

export interface MockChannel extends ChannelAdapter {
  // Every delivery it would have made, oldest first.
  readonly deliveries: readonly Delivery[];
}

// The only Channel until real Integrations arrive (Phase 4): it records what it would
// have sent and publishes nothing.
export function createMockChannel(): MockChannel {
  const deliveries: Delivery[] = [];
  return {
    deliveries,
    async deliver(delivery) {
      // A copy: the record shows what was sent even if the caller's object changes later.
      deliveries.push(structuredClone(delivery));
      return { deliveryId: `mock-${randomUUID()}` };
    },
  };
}
