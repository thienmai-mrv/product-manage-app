import { Router } from "express";
import { asyncRoute } from "../asyncRoute.js";
import { localEnv } from "../env.js";
import { parseLoginBody } from "../loginInput.js";
import { authenticate, findUserById } from "../store.js";
import {
  readCookie,
  requireSessionSecret,
  sessionCookieHeader,
  signSession,
  verifySession,
} from "../session.js";

const router = Router();

/**
 * True when this Express request should set the Secure cookie flag.
 *
 * @param req Express request
 * @return True for HTTPS
 */
function expressIsSecure(req) {
  const forwarded = req.get("x-forwarded-proto");
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim().toLowerCase() === "https";
  }
  return req.protocol === "https";
}

router.post("/login", asyncRoute(async (req, res) => {
  const env = localEnv();
  const secret = requireSessionSecret(env);
  const user = await authenticate(env, parseLoginBody(req.body));
  const token = signSession(user.id, secret);
  res.append("Set-Cookie", sessionCookieHeader(token, { secure: expressIsSecure(req) }));
  res.status(200).json({ user });
}));

router.get("/session", asyncRoute(async (req, res) => {
  const env = localEnv();
  const secret = requireSessionSecret(env);
  const token = readCookie(req.headers.cookie);
  const userId = token ? verifySession(token, secret) : null;
  if (!userId) {
    res.json({ authenticated: false });
    return;
  }
  const user = await findUserById(env, userId);
  if (!user) {
    res.json({ authenticated: false });
    return;
  }
  res.json({ authenticated: true, user });
}));

router.post("/logout", asyncRoute(async (req, res) => {
  res.append("Set-Cookie", sessionCookieHeader("", { secure: expressIsSecure(req), clear: true }));
  res.json({ ok: true });
}));

export default router;
