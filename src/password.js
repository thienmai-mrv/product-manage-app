import { pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2Async = promisify(pbkdf2);
const ITERATIONS = 100000;
const SALT_BYTES = 16;
const DIGEST_BYTES = 32;
const PREFIX = "pbkdf2-sha256";

/**
 * Hash a trimmed password with PBKDF2-SHA256.
 * Stored form is `pbkdf2-sha256$100000$<base64url salt>$<base64url digest>`.
 *
 * @param plain Plaintext password
 * @return Stored hash
 */
export async function hashPassword(plain) {
  const password = String(plain ?? "").trim();
  const salt = randomBytes(SALT_BYTES);
  const digest = await pbkdf2Async(password, salt, ITERATIONS, DIGEST_BYTES, "sha256");
  return `${PREFIX}$${ITERATIONS}$${salt.toString("base64url")}$${digest.toString("base64url")}`;
}

/**
 * Check a trimmed password against a stored hash.
 * A bad shape or a length mismatch returns false and does not throw.
 *
 * @param plain Plaintext password
 * @param stored Stored hash
 * @return True when the password matches
 */
export async function verifyPassword(plain, stored) {
  if (typeof stored !== "string") {
    return false;
  }
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== PREFIX || parts[1] !== String(ITERATIONS)) {
    return false;
  }
  const salt = Buffer.from(parts[2], "base64url");
  const expected = Buffer.from(parts[3], "base64url");
  if (salt.length !== SALT_BYTES || expected.length !== DIGEST_BYTES) {
    return false;
  }
  const actual = await pbkdf2Async(String(plain ?? "").trim(), salt, ITERATIONS, DIGEST_BYTES, "sha256");
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}
