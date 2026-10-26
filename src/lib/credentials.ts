import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Integration credentials at rest: AES-256-GCM, authenticated encryption with a key from
// the server environment (credentialsEnv in src/lib/env.ts). `context` is bound in as
// associated data, so a sealed value only opens for the record it was sealed for: copied
// to another Workspace's row, it fails like a tampered one.
//
// A sealed value is "v1.<iv>.<auth tag>.<ciphertext>", each part base64url.

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
export const CREDENTIAL_KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

// A fixed message: never the value, the key or the cause.
export class CredentialDecryptionError extends Error {
  override name = "CredentialDecryptionError";
  constructor() {
    super("The stored credential can't be decrypted.");
  }
}

function checkKey(key: Buffer): void {
  if (key.length !== CREDENTIAL_KEY_BYTES) throw new Error(`The credential key must be ${CREDENTIAL_KEY_BYTES} bytes.`);
}

export function encryptCredential(plaintext: string, key: Buffer, context: string): string {
  checkKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const parts = [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url"));
  return [VERSION, ...parts].join(".");
}

// Throws CredentialDecryptionError when the value was tampered with, sealed with another
// key or for another context, or isn't a sealed value at all.
export function decryptCredential(sealed: string, key: Buffer, context: string): string {
  checkKey(key);
  const [version, iv, tag, ciphertext, ...rest] = sealed.split(".");
  if (version !== VERSION || iv === undefined || tag === undefined || ciphertext === undefined || rest.length > 0) {
    throw new CredentialDecryptionError();
  }
  const ivBytes = Buffer.from(iv, "base64url");
  const tagBytes = Buffer.from(tag, "base64url");
  if (ivBytes.length !== IV_BYTES || tagBytes.length !== TAG_BYTES) throw new CredentialDecryptionError();
  try {
    const decipher = createDecipheriv(ALGORITHM, key, ivBytes, { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(tagBytes);
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new CredentialDecryptionError();
  }
}
