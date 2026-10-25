// Every model the app may call, with the provider that serves it and its list price in
// US dollars per million tokens. A model must be listed here to be used, so every Task's
// cost can be estimated. Prices change: check them when adding or updating a model.
// Mistral prices as listed in October 2026 (mistral.ai/pricing).
export const AI_MODELS = {
  // Mistral Small 4.
  "mistral-small-2603": { provider: "mistral", inputUsdPerMillion: 0.15, outputUsdPerMillion: 0.6 },
  // Mistral Medium 3.5.
  "mistral-medium-2604": { provider: "mistral", inputUsdPerMillion: 1.5, outputUsdPerMillion: 7.5 },
  // Mistral Large 3.
  "mistral-large-2512": { provider: "mistral", inputUsdPerMillion: 0.5, outputUsdPerMillion: 1.5 },
  // The fake provider (tests, local runs without a bill): free.
  fake: { provider: "fake", inputUsdPerMillion: 0, outputUsdPerMillion: 0 },
} as const satisfies Record<string, ModelPrice>;

export type AiModel = keyof typeof AI_MODELS;

interface ModelPrice {
  provider: string;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

export interface TokenCount {
  model: AiModel;
  inputTokens: number;
  outputTokens: number;
}

// The estimated cost in millionths of a US dollar, rounded to the nearest one: a price
// per million tokens is exactly a price in micro-dollars per token.
export function estimateCostMicroUsd({ model, inputTokens, outputTokens }: TokenCount): number {
  const { inputUsdPerMillion, outputUsdPerMillion } = AI_MODELS[model];
  return Math.round(inputTokens * inputUsdPerMillion + outputTokens * outputUsdPerMillion);
}
