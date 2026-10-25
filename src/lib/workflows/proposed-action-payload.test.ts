import { describe, expect, it } from "vitest";
import { canonicalizePayload, hashPayload, type ProposedActionPayload } from "./proposed-action-payload";

const PAYLOAD: ProposedActionPayload = {
  channel: "MOCK",
  contentType: "SOCIAL_POST",
  content: { body: "Our autumn blend lands Monday." },
  audience: null,
  timing: { kind: "AS_SOON_AS_APPROVED" },
};

describe("the Proposed Action payload hash", () => {
  it("is the SHA-256 of the canonical serialization: keys sorted at every level, no whitespace", () => {
    // Worked out independently: printf '%s' '<canonical>' | sha256sum
    const canonical =
      '{"audience":null,"channel":"MOCK","content":{"body":"Our autumn blend lands Monday."},' +
      '"contentType":"SOCIAL_POST","timing":{"kind":"AS_SOON_AS_APPROVED"}}';

    expect(canonicalizePayload(PAYLOAD)).toBe(canonical);
    expect(hashPayload(PAYLOAD)).toBe("0c6de3aa9e9ed5c50b694b04d8a70211b4cb0d873a5ff33dc337acfef62bb53d");
  });

  it("covers an Email's subject line, inside the content", () => {
    const email: ProposedActionPayload = {
      ...PAYLOAD,
      contentType: "EMAIL",
      content: { subject: "Welcome to Northwind", body: "Thanks for joining us." },
    };
    // Worked out independently: printf '%s' '<canonical>' | sha256sum
    const canonical =
      '{"audience":null,"channel":"MOCK","content":{"body":"Thanks for joining us.","subject":"Welcome to Northwind"},' +
      '"contentType":"EMAIL","timing":{"kind":"AS_SOON_AS_APPROVED"}}';

    expect(canonicalizePayload(email)).toBe(canonical);
    expect(hashPayload(email)).toBe("e309359f10addbf93227aed81a788c399bfe73fc9c7afeac4aef50a6495526a1");
  });

  it("is the same for the same payload, whatever order its keys were written in", () => {
    const reordered: ProposedActionPayload = {
      timing: { kind: "AS_SOON_AS_APPROVED" },
      audience: null,
      content: { body: "Our autumn blend lands Monday." },
      contentType: "SOCIAL_POST",
      channel: "MOCK",
    };

    expect(hashPayload(reordered)).toBe(hashPayload(PAYLOAD));
    expect(hashPayload({ ...PAYLOAD })).toBe(hashPayload(PAYLOAD));
  });

  it("changes when any field changes", () => {
    const changed: ProposedActionPayload[] = [
      { ...PAYLOAD, content: { body: "Our autumn blend lands Tuesday." } },
      { ...PAYLOAD, content: { body: "Our autumn blend lands Monday. " } },
      { ...PAYLOAD, contentType: "AD_COPY" },
      { ...PAYLOAD, audience: "Newsletter subscribers" },
      { ...PAYLOAD, content: { ...PAYLOAD.content, subject: "Autumn blend" } },
    ];

    const hashes = changed.map(hashPayload);

    expect(hashes).not.toContain(hashPayload(PAYLOAD));
    expect(new Set(hashes).size).toBe(changed.length);
  });
});
