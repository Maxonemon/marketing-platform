import type { z } from "zod";
import type { TokenCount } from "./pricing";

// The only path to an AI model. Agents call `generate`; nothing else talks to a model.
// A request must name a max token limit, so one call can't run up a large bill.

export interface AiRequest<T> {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens: number;
}

// What one call used, and on which model: enough to estimate its cost (./pricing.ts).
export type AiUsage = TokenCount;

export interface AiResponse<T> {
  output: T;
  usage: AiUsage;
}

export interface AiProvider {
  generate<T>(request: AiRequest<T>): Promise<AiResponse<T>>;
}

export interface AiProviderErrorOptions {
  // A failure that may pass if the call is made again (rate limit, outage, timeout).
  transient?: boolean;
  // Set when the model answered (and so was billed) but the answer was unusable.
  usage?: AiUsage;
}

// A failure of the AI call itself. Its message is shown to members on the failed Task,
// so providers put only safe text in it: never keys, prompts or raw responses.
export class AiProviderError extends Error {
  override name = "AiProviderError";
  readonly transient: boolean;
  readonly usage: AiUsage | undefined;

  constructor(message: string, { transient = false, usage }: AiProviderErrorOptions = {}) {
    super(message);
    this.transient = transient;
    this.usage = usage;
  }
}

export const AI_OUTPUT_INVALID = "The AI response didn't have the expected structure.";

// Every provider validates the model's raw output here; nothing half-formed gets through.
// An invalid answer is a permanent failure: asking again costs money and rarely helps.
export function parseAiOutput<T>(schema: z.ZodType<T>, raw: unknown, usage: AiUsage): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new AiProviderError(AI_OUTPUT_INVALID, { usage });
  return parsed.data;
}
