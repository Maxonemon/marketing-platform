import { Mistral } from "@mistralai/mistralai";
import type { AiEnv } from "@/lib/env";
import { VARIANT_COUNT } from "./content-agent";
import { createFakeAiProvider } from "./fake-provider";
import { createMistralProvider } from "./mistral-provider";
import type { AiProvider } from "./provider";

// One call may take this long before it counts as a transient failure.
const AI_REQUEST_TIMEOUT_MS = 60_000;

// What the fake model writes for any content request: placeholders, no bill. The subject
// is dropped by validation for content types that have none.
const PLACEHOLDER_VARIANTS = {
  variants: Array.from({ length: VARIANT_COUNT }, (_, index) => ({
    subject: `Placeholder subject ${index + 1}`,
    body: `Placeholder Variant ${index + 1}, written by the fake AI provider.`,
  })),
};

// The provider for the configured model (src/lib/env.ts). The SDK's own retries are off:
// the background function retries transient failures itself, a bounded number of times.
export function createAiProvider(env: AiEnv): AiProvider {
  switch (env.provider) {
    case "mistral": {
      const client = new Mistral({
        apiKey: env.mistralApiKey,
        retryConfig: { strategy: "none" },
        timeoutMs: AI_REQUEST_TIMEOUT_MS,
      });
      return createMistralProvider(client, env.model);
    }
    case "fake":
      return createFakeAiProvider(() => PLACEHOLDER_VARIANTS);
  }
}
