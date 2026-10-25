import { parseAiOutput, type AiProvider, type AiRequest, type AiUsage } from "./provider";

// Returns the model's raw output for a request, or throws to simulate a failed call.
export type FakeReply = (request: AiRequest<unknown>) => unknown;

export interface FakeAiProvider extends AiProvider {
  // Every request received, oldest first.
  readonly requests: readonly AiRequest<unknown>[];
}

export interface FakeAiProviderOptions {
  // The usage every answer reports; free and on the "fake" model unless set.
  usage?: Partial<AiUsage>;
}

const FAKE_USAGE: AiUsage = { model: "fake", inputTokens: 0, outputTokens: 0 };

// Stands in for a real model in tests. The reply is validated like a real model's
// output, so a malformed one fails the call.
export function createFakeAiProvider(reply: FakeReply, options: FakeAiProviderOptions = {}): FakeAiProvider {
  const requests: AiRequest<unknown>[] = [];
  const usage: AiUsage = { ...FAKE_USAGE, ...options.usage };
  return {
    requests,
    async generate(request) {
      requests.push(request);
      const raw = reply(request);
      return { output: parseAiOutput(request.schema, raw, usage), usage };
    },
  };
}
