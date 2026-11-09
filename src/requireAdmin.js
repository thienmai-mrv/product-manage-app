import { findUserById } from "./store.js";
import { readCookie, requireSessionSecret, verifySession } from "./session.js";

/**
 * Create an HTTP-style error.
 *
 * @param status HTTP status
 * @param message Error text
 * @return Error with a status
 */
function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/**
 * Require a live administrator for a catalog write.
 * A missing or short secret is HTTP 500. A missing, expired, tampered, or unknown cookie is HTTP 401.
 *
 * @param cookieHeader Cookie header
 * @param env Worker or local environment
 * @return Public user
 */
export async function resolveAdmin(cookieHeader, env) {
  const secret = requireSessionSecret(env);
  const token = readCookie(cookieHeader);
  const userId = token ? verifySession(token, secret) : null;
  if (!userId) {
    throw httpError(401, "Authentication required");
  }
  const user = await findUserById(env, userId);
  if (!user) {
    throw httpError(401, "Authentication required");
  }
  return user;
}
