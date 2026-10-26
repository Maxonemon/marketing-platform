import { randomUUID } from "node:crypto";
import { NotDeliveredError, type ChannelAdapter, type Delivery } from "./channel-adapter";

export interface MockChannel extends ChannelAdapter {
  // Every delivery it would have made, oldest first. Failed attempts sent nothing.
  readonly deliveries: readonly Delivery[];
}

export interface MockChannelOptions {
  // Attempts up to this number fail with nothing sent, e.g. 1 fails each first attempt.
  failedAttempts?: number;
}

export const MOCK_DELIVERY_FAILED = "The mock Channel was told to fail this attempt.";

// The only Channel until real Integrations arrive (Phase 4): it records what it would
// have sent and publishes nothing. It can be told to fail, for tests and dev.
export function createMockChannel({ failedAttempts = 0 }: MockChannelOptions = {}): MockChannel {
  const deliveries: Delivery[] = [];
  return {
    deliveries,
    async deliver(delivery) {
      if (delivery.attempt <= failedAttempts) throw new NotDeliveredError(MOCK_DELIVERY_FAILED);
      // A copy: the record shows what was sent even if the caller's object changes later.
      deliveries.push(structuredClone(delivery));
      return { deliveryId: `mock-${randomUUID()}` };
    },
  };
}
