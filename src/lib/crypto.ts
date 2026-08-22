import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Authenticated encryption for secrets that have to be used rather than
 * verified — GitHub tokens, and the API credentials people type into the
 * console. Those can't be hashed the way sessions and API keys are, so they get
 * AES-256-GCM instead.
 *
 * The key is derived from SESSION_SECRET unless ENCRYPTION_KEY is set, so this
 * needs no new configuration. That does mean rotating SESSION_SECRET makes
 * existing ciphertexts unreadable — which is handled as "not set" rather than a
 * crash, so the worst case is reconnecting GitHub and re-entering credentials.
 */
const PREFIX = "v1";

function keyMaterial() {
  const explicit = process.env.ENCRYPTION_KEY;
  const fallback = process.env.SESSION_SECRET;
  const source = explicit || fallback;

  if (!source) {
    throw new Error("Set SESSION_SECRET (or ENCRYPTION_KEY) — secrets can't be stored without it");
  }
  // A separate key from the one signing sessions, even off the same secret.
  return createHash("sha256").update(`arc:secret-encryption:${source}`).digest();
}

let cached: Buffer | null = null;
function key() {
  if (!cached) cached = keyMaterial();
  return cached;
}

/** True for a value this module produced, as opposed to legacy plaintext. */
export function isEncrypted(value: string) {
  return value.startsWith(`${PREFIX}.`);
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(
    ".",
  );
}

/**
 * Returns the plaintext, or null when the value can't be read — a wrong key, a
 * tampered ciphertext, or a truncated row. Callers treat null as "no secret
 * stored" so a bad value prompts a reconnect instead of throwing mid-request.
 *
 * A value with no version prefix is plaintext written before this existed; it's
 * returned as-is and re-encrypted next time it's written.
 */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!isEncrypted(stored)) return stored;

  const [, ivPart, tagPart, dataPart] = stored.split(".");
  if (!ivPart || !tagPart || !dataPart) return null;

  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // GCM authentication failed: wrong key, or the row was altered.
    return null;
  }
}

/** Encrypts when there's something to store, and passes null straight through. */
export function encryptOptional(plain: string | null | undefined): string | null {
  return plain ? encryptSecret(plain) : null;
}

/** The last four characters of a secret, for showing which one is stored. */
export function secretHint(stored: string | null | undefined): string | null {
  const plain = decryptSecret(stored);
  return plain ? `••••${plain.slice(-4)}` : null;
}

/** Constant-time compare, for the rare case of matching two secrets. */
export function secretsMatch(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
