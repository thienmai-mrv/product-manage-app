import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer as createViteServer } from "vite";

let vite;
let AuthControl;
let Login;
let ADMIN_PATHS;

before(async () => {
  vite = await createViteServer({
    root: "web",
    configFile: "web/vite.config.js",
    server: { middlewareMode: true },
    appType: "custom",
    optimizeDeps: { noDiscovery: true },
  });
  ({ ADMIN_PATHS } = await vite.ssrLoadModule("/src/authPaths.js"));
  ({ default: AuthControl } = await vite.ssrLoadModule("/src/components/AuthControl.jsx"));
  ({ default: Login } = await vite.ssrLoadModule("/src/components/Login.jsx"));
});

after(async () => {
  if (vite) {
    await vite.close();
  }
});

test("login control, login form, and admin paths render the required text", () => {
  const loggedOut = renderToStaticMarkup(React.createElement(AuthControl, { authenticated: false }));
  assert.match(loggedOut, />Login</);
  const loggedIn = renderToStaticMarkup(React.createElement(AuthControl, { authenticated: true }));
  assert.match(loggedIn, />Logout</);
  const form = renderToStaticMarkup(React.createElement(Login, { error: "Bad credentials" }));
  assert.match(form, /<form class="config-form"/);
  assert.match(form, /<button type="submit" class="primary">Login<\/button>/);
  assert.match(form, /class="message error"/);
  assert.match(form, /Bad credentials/);
  assert.deepEqual(ADMIN_PATHS, ["/products", "/brands", "/categories"]);
});

test("narrow nav wraps so Categories and the auth control stay in view", () => {
  const css = fs.readFileSync(new URL("./index.css", import.meta.url), "utf8");
  const narrowStart = css.indexOf("@media (max-width: 639px)");
  assert.ok(narrowStart >= 0);
  const nextQuery = css.indexOf("@media", narrowStart + 1);
  const narrow = nextQuery === -1 ? css.slice(narrowStart) : css.slice(narrowStart, nextQuery);
  assert.match(narrow, /\.nav\s*\{[^}]*flex-wrap:\s*wrap/);
  const baseNav = css.slice(css.indexOf(".nav {"), css.indexOf(".nav-link {"));
  assert.equal(baseNav.includes("flex-wrap"), false);
});
