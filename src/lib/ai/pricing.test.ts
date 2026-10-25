import { describe, expect, it } from "vitest";
import { estimateCostMicroUsd } from "./pricing";

describe("the estimated cost of an AI call", () => {
  it("is the tokens times the model's price per million, in micro-dollars", () => {
    // Mistral Large 3 at $0.50 in / $1.50 out per million: one million of each is $2.
    expect(estimateCostMicroUsd({ model: "mistral-large-2512", inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(
      2_000_000,
    );
    // Mistral Small 4 at $0.15 / $0.60: 1,200 in is 180 µ$, 900 out is 540 µ$.
    expect(estimateCostMicroUsd({ model: "mistral-small-2603", inputTokens: 1200, outputTokens: 900 })).toBe(720);
  });

  it("rounds to the nearest micro-dollar", () => {
    // 3 × 0.15 = 0.45 and 1 × 0.6 = 0.6: 1.05 µ$ in all.
    expect(estimateCostMicroUsd({ model: "mistral-small-2603", inputTokens: 3, outputTokens: 1 })).toBe(1);
  });

  it("is free on the fake model", () => {
    expect(estimateCostMicroUsd({ model: "fake", inputTokens: 5000, outputTokens: 5000 })).toBe(0);
  });
});
