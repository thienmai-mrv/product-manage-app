import assert from "node:assert/strict";
import test from "node:test";
import { clientErrorMessage } from "./httpErrors.js";
import { parseLoginBody } from "./loginInput.js";
import { hashPassword, verifyPassword } from "./password.js";
import {
  readCookie,
  requireSessionSecret,
  sessionCookieHeader,
  signSession,
  verifySession,
} from "./session.js";

const SECRET = "auth-test-secret-0123456789abcdef";
const NOW = 1_700_000_000_000;

/**
 * Assert a rejected call carries the HTTP status and sentence.
 *
 * @param fn Call to run
 * @param status Expected status
 * @param message Expected message
 */
async function assertHttp(fn, status, message) {
  await assert.rejects(fn, (error) => error.status === status && error.message === message);
}

test("password hash round trip, wrong password, tampered digest, and non-string stored value", async () => {
  const stored = await hashPassword("  secret-pass  ");
  assert.match(stored, /^pbkdf2-sha256\$100000\$[^$]+\$[^$]+$/);
  assert.equal(await verifyPassword("secret-pass", stored), true);
  assert.equal(await verifyPassword("wrong-pass", stored), false);
  const parts = stored.split("$");
  const digest = Buffer.from(parts[3], "base64url");
  digest[0] ^= 0xff;
  parts[3] = digest.toString("base64url");
  assert.equal(await verifyPassword("secret-pass", parts.join("$")), false);
  assert.equal(await verifyPassword("secret-pass", null), false);
  assert.equal(await verifyPassword("secret-pass", 12), false);
});

test("parseLoginBody accepts one username, email, or account and rejects the decision 5 failures", async () => {
  assert.deepEqual(parseLoginBody({ username: "Ada", password: "secret-pass" }), {
    lookup: "username",
    value: "Ada",
    password: "secret-pass",
  });
  assert.deepEqual(parseLoginBody({ email: " Ada@Example.com ", password: "secret-pass" }), {
    lookup: "email",
    value: "Ada@Example.com",
    password: "secret-pass",
  });
  assert.deepEqual(parseLoginBody({ account: "ada", password: "secret-pass" }), {
    lookup: "username",
    value: "ada",
    password: "secret-pass",
  });
  assert.deepEqual(parseLoginBody({ account: "ada@example.com", password: "secret-pass" }), {
    lookup: "email",
    value: "ada@example.com",
    password: "secret-pass",
  });
  await assertHttp(async () => parseLoginBody({}), 400, "Username or email is required");
  await assertHttp(async () => parseLoginBody({ username: "   ", email: "  ", password: "secret-pass" }), 400, "Username or email is required");
  await assertHttp(async () => parseLoginBody({ username: "ada", email: "ada@example.com", password: "secret-pass" }), 400, "Provide one username or email");
  await assertHttp(async () => parseLoginBody([]), 400, "Body must be a JSON object");
  await assertHttp(async () => parseLoginBody(null), 400, "Body must be a JSON object");
  await assertHttp(async () => parseLoginBody({ username: "ada", password: "   " }), 400, "Password is required");
});

test("session cookie round trip, tampered signature, past expiry, missing cookie, and Secure flag", () => {
  const token = signSession("user-1", SECRET, NOW);
  assert.equal(verifySession(token, SECRET, NOW), "user-1");
  const [payload, mac] = token.split(".");
  const macBytes = Buffer.from(mac, "base64url");
  macBytes[0] ^= 0xff;
  assert.equal(verifySession(`${payload}.${macBytes.toString("base64url")}`, SECRET, NOW), null);
  assert.equal(verifySession("not-a-token", SECRET, NOW), null);
  const exp = Math.floor(NOW / 1000) + 28800;
  assert.equal(verifySession(token, SECRET, (exp + 1) * 1000), null);
  assert.equal(readCookie(undefined), null);
  assert.equal(readCookie("theme=light"), null);
  const https = sessionCookieHeader(token, { secure: true });
  assert.match(https, /^admin_session=/);
  assert.match(https, /HttpOnly/);
  assert.match(https, /Max-Age=28800/);
  assert.match(https, /Secure/);
  const httpHeader = sessionCookieHeader(token, { secure: false });
  assert.equal(httpHeader.includes("Secure"), false);
  const cleared = sessionCookieHeader(token, { secure: true, clear: true });
  assert.match(cleared, /Max-Age=0/);
  assert.match(cleared, /Secure/);
  assert.equal(requireSessionSecret({ SESSION_SECRET: SECRET }), SECRET);
  assert.throws(() => requireSessionSecret({ SESSION_SECRET: "short" }), (error) => error.status === 500 && error.message === "SESSION_SECRET is not set");
});

test("clientErrorMessage masks unexpected 500s and keeps the three configuration sentences", () => {
  assert.equal(clientErrorMessage(500, "database exploded"), "Request failed");
  assert.equal(clientErrorMessage(500, "MONGODB_URI is not set"), "MONGODB_URI is not set");
  assert.equal(clientErrorMessage(500, "SESSION_SECRET is not set"), "SESSION_SECRET is not set");
  assert.equal(clientErrorMessage(500, "Admin bootstrap configuration is incomplete"), "Admin bootstrap configuration is incomplete");
  assert.equal(clientErrorMessage(400, "Password is required"), "Password is required");
});
