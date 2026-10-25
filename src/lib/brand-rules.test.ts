import { describe, expect, it } from "vitest";
import { checkBrandRules } from "./brand-rules";

const RULES = {
  prohibitedPhrases: ["guaranteed", "best coffee in the world"],
  requiredDisclaimers: ["Offer ends Sunday."],
};

describe("checkBrandRules", () => {
  it("finds nothing in text that follows the rules", () => {
    expect(checkBrandRules("Our autumn blend lands Monday. Offer ends Sunday.", RULES)).toEqual([]);
  });

  it("finds a prohibited phrase whatever its case", () => {
    expect(checkBrandRules("GUARANTEED fresh. Offer ends Sunday.", RULES)).toEqual([
      { kind: "PROHIBITED_PHRASE", phrase: "guaranteed" },
    ]);
  });

  it("flags a missing required disclaimer", () => {
    expect(checkBrandRules("Our autumn blend lands Monday.", RULES)).toEqual([
      { kind: "MISSING_DISCLAIMER", disclaimer: "Offer ends Sunday." },
    ]);
  });

  it("finds every violation at once, each once", () => {
    const text = "The best coffee in the world, guaranteed. Yes, guaranteed.";

    expect(checkBrandRules(text, RULES)).toEqual([
      { kind: "PROHIBITED_PHRASE", phrase: "guaranteed" },
      { kind: "PROHIBITED_PHRASE", phrase: "best coffee in the world" },
      { kind: "MISSING_DISCLAIMER", disclaimer: "Offer ends Sunday." },
    ]);
  });

  it("matches whole words only: a prohibited word inside another word is fine", () => {
    const rules = { prohibitedPhrases: ["free"], requiredDisclaimers: [] };

    expect(checkBrandRules("Freedom in every cup, carefree mornings.", rules)).toEqual([]);
    expect(checkBrandRules("Free shipping on every bag.", rules)).toEqual([{ kind: "PROHIBITED_PHRASE", phrase: "free" }]);
  });

  it("treats line breaks and repeated spaces as one space", () => {
    const text = "The best coffee\nin the   world. Offer ends\nSunday.";

    expect(checkBrandRules(text, RULES)).toEqual([{ kind: "PROHIBITED_PHRASE", phrase: "best coffee in the world" }]);
  });

  it("matches phrases that start or end with punctuation", () => {
    const rules = { prohibitedPhrases: ["100%", "#ad"], requiredDisclaimers: ["*Terms apply"] };

    expect(checkBrandRules("100% arabica #ad *terms apply", rules)).toEqual([
      { kind: "PROHIBITED_PHRASE", phrase: "100%" },
      { kind: "PROHIBITED_PHRASE", phrase: "#ad" },
    ]);
  });

  it("finds nothing when the Brand has no rules", () => {
    expect(checkBrandRules("Anything goes.", { prohibitedPhrases: [], requiredDisclaimers: [] })).toEqual([]);
  });
});
