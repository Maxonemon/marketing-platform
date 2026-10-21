import { parseAiOutput, type AiProvider, type AiRequest } from "./provider";

// Returns the model's raw output for a request, or throws to simulate a failed call.
export type FakeReply = (request: AiRequest<unknown>) => unknown;

export interface FakeAiProvider extends AiProvider {
  // Every request received, oldest first.
  readonly requests: readonly AiRequest<unknown>[];
}

// Stands in for a real model: in tests, and in the app until the real provider (ticket 06).
// The reply is validated like a real model's output, so a malformed one fails the call.
export function createFakeAiProvider(reply: FakeReply): FakeAiProvider {
  const requests: AiRequest<unknown>[] = [];
  return {
    requests,
    async generate(request) {
      requests.push(request);
      const raw = reply(request);
      return { output: parseAiOutput(request.schema, raw), usage: { inputTokens: 0, outputTokens: 0 } };
    },
  };
}
