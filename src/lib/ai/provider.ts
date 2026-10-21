import type { z } from "zod";

// The only path to an AI model. Agents call `generate`; nothing else talks to a model.
// A request must name a max token limit, so one call can't run up a large bill.

export interface AiRequest<T> {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens: number;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AiResponse<T> {
  output: T;
  usage: AiUsage;
}

export interface AiProvider {
  generate<T>(request: AiRequest<T>): Promise<AiResponse<T>>;
}

// A failure of the AI call itself. Its message is shown to members on the failed Task,
// so providers put only safe text in it: never keys, prompts or raw responses.
export class AiProviderError extends Error {
  override name = "AiProviderError";
}

export const AI_OUTPUT_INVALID = "The AI response didn't have the expected structure.";

// Every provider validates the model's raw output here; nothing half-formed gets through.
export function parseAiOutput<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new AiProviderError(AI_OUTPUT_INVALID);
  return parsed.data;
}
