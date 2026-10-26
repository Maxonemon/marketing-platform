import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CredentialDecryptionError, decryptCredential, encryptCredential } from "./credentials";

const KEY = randomBytes(32);
const CONTEXT = "integration:workspace-1:SLACK";
const SECRET = "https://hooks.slack.com/services/T0001/B0001/abcdefghijklmnopqrstuvwx";

describe("credential encryption", () => {
  it("round-trips a credential, and the sealed value does not contain it", () => {
    const sealed = encryptCredential(SECRET, KEY, CONTEXT);

    expect(sealed).not.toContain(SECRET);
    expect(sealed).not.toContain("abcdefghijklmnopqrstuvwx");
    expect(decryptCredential(sealed, KEY, CONTEXT)).toBe(SECRET);
  });

  it("seals the same credential differently each time", () => {
    expect(encryptCredential(SECRET, KEY, CONTEXT)).not.toBe(encryptCredential(SECRET, KEY, CONTEXT));
  });

  it("detects a tampered value", () => {
    const sealed = encryptCredential(SECRET, KEY, CONTEXT);
    const parts = sealed.split(".");
    const ciphertext = Buffer.from(parts[3] ?? "", "base64url");
    ciphertext[0] = (ciphertext[0] ?? 0) ^ 1;
    const tampered = [...parts.slice(0, 3), ciphertext.toString("base64url")].join(".");

    expect(() => decryptCredential(tampered, KEY, CONTEXT)).toThrow(CredentialDecryptionError);
  });

  it("refuses another key, another context, and a value that isn't sealed", () => {
    const sealed = encryptCredential(SECRET, KEY, CONTEXT);

    expect(() => decryptCredential(sealed, randomBytes(32), CONTEXT)).toThrow(CredentialDecryptionError);
    expect(() => decryptCredential(sealed, KEY, "integration:workspace-2:SLACK")).toThrow(CredentialDecryptionError);
    expect(() => decryptCredential("not-sealed", KEY, CONTEXT)).toThrow(CredentialDecryptionError);
  });

  it("refuses a key that isn't 32 bytes", () => {
    expect(() => encryptCredential(SECRET, randomBytes(16), CONTEXT)).toThrow("must be 32 bytes");
  });
});
