import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "admin_session";
const MAX_AGE_SECONDS = 28800;

/**
 * Throw when the signing secret is missing or shorter than 32 characters.
 *
 * @param env Worker or local environment
 * @return Trimmed secret
 */
export function requireSessionSecret(env) {
  const secret = String(env?.SESSION_SECRET ?? "").trim();
  if (secret.length < 32) {
    const error = new Error("SESSION_SECRET is not set");
    error.status = 500;
    throw error;
  }
  return secret;
}

/**
 * Sign an absolute 8-hour session token.
 * Payload keys are `sub` then `exp`. The MAC covers the payload segment.
 *
 * @param userId userinfo id
 * @param secret HMAC key
 * @param nowMs Issue time in milliseconds
 * @return `payload.mac` token
 */
export function signSession(userId, secret, nowMs = Date.now()) {
  const exp = Math.floor(nowMs / 1000) + MAX_AGE_SECONDS;
  const payload = Buffer.from(JSON.stringify({ sub: String(userId), exp }), "utf8").toString("base64url");
  const mac = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

/**
 * Read a session token.
 * Returns the user id, or null for a bad shape, bad MAC, or `exp <= now`.
 *
 * @param token Cookie value
 * @param secret HMAC key
 * @param nowMs Current time in milliseconds
 * @return User id or null
 */
export function verifySession(token, secret, nowMs = Date.now()) {
  if (typeof token !== "string" || typeof secret !== "string" || secret.length === 0) {
    return null;
  }
  const dot = token.indexOf(".");
  if (dot <= 0 || token.indexOf(".", dot + 1) !== -1) {
    return null;
  }
  const payload = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(payload).digest();
  const actual = Buffer.from(mac, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed.sub !== "string" || parsed.sub.length === 0) {
    return null;
  }
  if (typeof parsed.exp !== "number" || !Number.isFinite(parsed.exp)) {
    return null;
  }
  if (parsed.exp <= Math.floor(nowMs / 1000)) {
    return null;
  }
  return parsed.sub;
}

/**
 * Read the first `admin_session` value from a Cookie header.
 *
 * @param cookieHeader Cookie header
 * @return Token or null
 */
export function readCookie(cookieHeader) {
  if (typeof cookieHeader !== "string" || cookieHeader.length === 0) {
    return null;
  }
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    if (trimmed.slice(0, eq).trim() === COOKIE_NAME) {
      const value = trimmed.slice(eq + 1);
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

/**
 * Build the Set-Cookie header for a session token or a clear.
 * `Secure` is included only when the caller passes `secure: true`.
 *
 * @param token Signed token. Ignored when clearing.
 * @param options.secure Add the Secure flag
 * @param options.clear Emit the Max-Age=0 clearer
 * @return Set-Cookie header value
 */
export function sessionCookieHeader(token, { secure = false, clear = false } = {}) {
  const value = clear ? "" : token;
  const maxAge = clear ? 0 : MAX_AGE_SECONDS;
  const secureFlag = secure ? "; Secure" : "";
  return `${COOKIE_NAME}=${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secureFlag}`;
}

/**
 * Check a document request cookie without opening MongoDB.
 * A missing or short secret is logged out.
 *
 * @param cookieHeader Cookie header
 * @param env Worker or local environment
 * @param nowMs Current time in milliseconds
 * @return User id or null
 */
export function pageSessionUserId(cookieHeader, env, nowMs = Date.now()) {
  const secret = String(env?.SESSION_SECRET ?? "").trim();
  if (secret.length < 32) {
    return null;
  }
  const token = readCookie(cookieHeader);
  if (!token) {
    return null;
  }
  return verifySession(token, secret, nowMs);
}

/**
 * True when the request URL is https or X-Forwarded-Proto starts with https.
 *
 * @param url Parsed request URL
 * @param forwardedProto X-Forwarded-Proto header
 * @return True for HTTPS
 */
export function requestIsSecure(url, forwardedProto) {
  if (typeof forwardedProto === "string" && forwardedProto.length > 0) {
    return forwardedProto.split(",")[0].trim().toLowerCase() === "https";
  }
  return url?.protocol === "https:";
}
