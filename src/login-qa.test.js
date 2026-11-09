import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { MongoClient } from "mongodb";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer as createViteServer } from "vite";
import { createApp } from "./app.js";
import { signSession } from "./session.js";
import { authenticate, createUserinfo, listBrands, listCategories } from "./store.js";
import worker from "./worker.js";

/**
 * Create an in-memory MongoDB database harness compatible with `src/store.js`,
 * including index tracking, optional failure injection, and case-insensitive collation.
 */
function createMemoryDatabase() {
  const collections = new Map();
  const createdIndexes = [];
  let failNextIndex = false;
  let forceDuplicateOnInsert = false;

  function getCollectionMap(name) {
    if (!collections.has(name)) {
      collections.set(name, new Map());
    }
    return collections.get(name);
  }

  function cloneDoc(doc) {
    if (!doc || typeof doc !== "object") {
      return doc;
    }
    return { ...doc };
  }

  function matchesQuery(doc, query = {}, options = {}) {
    for (const [key, condition] of Object.entries(query)) {
      if (condition && typeof condition === "object" && "$ne" in condition) {
        if (doc[key] === condition.$ne) {
          return false;
        }
        continue;
      }
      if ((key === "name" || key === "username" || key === "email") && options?.collation?.strength === 2) {
        if (String(doc[key] ?? "").toLowerCase() !== String(condition ?? "").toLowerCase()) {
          return false;
        }
        continue;
      }
      if (doc[key] !== condition) {
        return false;
      }
    }
    return true;
  }

  return {
    createdIndexes,
    failNextCreateIndex() {
      failNextIndex = true;
    },
    failNextInsertWith11000() {
      forceDuplicateOnInsert = true;
    },
    reset() {
      collections.clear();
      forceDuplicateOnInsert = false;
    },
    dump(name) {
      return Array.from(getCollectionMap(name).values()).map(cloneDoc);
    },
    collection(name) {
      const store = getCollectionMap(name);
      return {
        async createIndex(keys, options) {
          if (failNextIndex) {
            failNextIndex = false;
            throw new Error("Simulated index creation failure");
          }
          createdIndexes.push({ collection: name, keys, options });
          return options?.name || "ok";
        },
        async countDocuments(query = {}) {
          let count = 0;
          for (const doc of store.values()) {
            if (matchesQuery(doc, query)) {
              count += 1;
            }
          }
          return count;
        },
        async insertMany(docs) {
          for (const doc of docs) {
            if (store.has(doc._id)) {
              const error = new Error("Duplicate key");
              error.code = 11000;
              throw error;
            }
            store.set(doc._id, cloneDoc(doc));
          }
          return { insertedCount: docs.length };
        },
        async insertOne(doc) {
          if (forceDuplicateOnInsert || store.has(doc._id)) {
            forceDuplicateOnInsert = false;
            const error = new Error("Duplicate key");
            error.code = 11000;
            throw error;
          }
          store.set(doc._id, cloneDoc(doc));
          return { insertedId: doc._id };
        },
        async findOne(query = {}, options = {}) {
          for (const doc of store.values()) {
            if (matchesQuery(doc, query, options)) {
              return cloneDoc(doc);
            }
          }
          return null;
        },
        find(query = {}, options = {}) {
          let list = Array.from(store.values())
            .filter((doc) => matchesQuery(doc, query, options))
            .map(cloneDoc);
          return {
            sort(spec = {}) {
              if (spec.createdAt === -1) {
                list = list.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
              }
              return this;
            },
            async toArray() {
              if (options?.projection?.categoryId === 1) {
                return list.map((doc) => ({ _id: doc._id, categoryId: doc.categoryId }));
              }
              if (options?.projection?.brandId === 1) {
                return list.map((doc) => ({ _id: doc._id, brandId: doc.brandId }));
              }
              return list;
            },
          };
        },
        async updateOne(filter, update, options = {}) {
          const id = filter._id;
          const existing = store.get(id);
          if (!existing) {
            if (options.upsert) {
              store.set(id, {
                _id: id,
                ...(update.$setOnInsert || {}),
                ...(update.$set || {}),
              });
              return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
            }
            return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
          }
          store.set(id, {
            ...existing,
            ...(update.$set || {}),
          });
          return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
        },
        async replaceOne(filter, replacement, options = {}) {
          const id = filter._id;
          if (!store.has(id) && !options.upsert) {
            return { matchedCount: 0, modifiedCount: 0 };
          }
          store.set(id, cloneDoc(replacement));
          return { matchedCount: 1, modifiedCount: 1 };
        },
        async deleteOne(filter) {
          const existed = store.delete(filter._id);
          return { deletedCount: existed ? 1 : 0 };
        },
      };
    },
  };
}

const memoryDb = createMemoryDatabase();
const originalConnect = MongoClient.prototype.connect;
const originalDb = MongoClient.prototype.db;
const originalClose = MongoClient.prototype.close;
const nativeFetch = globalThis.fetch;

let expressServer;
let expressBaseUrl;
let vite;
let App;

const TEST_URI = "mongodb://127.0.0.1:27017/productmanage";
const SESSION_FIXTURE = "qa-login-session-secret-0123456789abcdef";
const workerEnv = { MONGODB_URI: TEST_URI, MONGODB_DB: "productmanage", SESSION_SECRET: SESSION_FIXTURE };

/**
 * Send a request to the Cloudflare Worker and return the Response.
 */
function callWorker(pathname, init = {}, envOverride = workerEnv, origin = "http://worker.local") {
  return worker.fetch(new Request(`${origin}${pathname}`, init), envOverride);
}

/**
 * Extract the Set-Cookie header for `admin_session`, or `""` when absent.
 */
function getSessionSetCookie(response) {
  const list = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  return list.find((item) => item.toLowerCase().startsWith("admin_session="))
    || response.headers.get("set-cookie")
    || "";
}

/**
 * Extract `admin_session=<token>` from a login Response.
 */
function extractCookiePair(response) {
  const raw = getSessionSetCookie(response);
  const match = /^admin_session=([^;]*)/.exec(raw);
  return match && match[1] ? `admin_session=${match[1]}` : "";
}

/**
 * Normalize a Location header to its pathname.
 */
function locationPath(response) {
  const loc = response.headers.get("location") || "";
  if (loc.startsWith("/")) {
    return loc;
  }
  return new URL(loc).pathname;
}

/**
 * Stateful hook + context renderer capable of driving `<MemoryRouter><App /></MemoryRouter>`
 * including client-side navigation, effects, forms, and button clicks without a browser DOM.
 */
const FORWARD_REF = Symbol.for("react.forward_ref");
const MEMO = Symbol.for("react.memo");
const CONTEXT = Symbol.for("react.context");
const PROVIDER = Symbol.for("react.provider");

function mountRouterApp(RootComponent, initialEntries = ["/"]) {
  const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const instances = new Map();
  let ctxMap = new Map();
  let curInst = null;
  let hookIdx = 0;
  let tree = null;
  const seenPaths = new Set();

  const dispatcher = {
    useContext(ctx) {
      return ctxMap.has(ctx) ? ctxMap.get(ctx) : ctx._currentValue;
    },
    useState(init) {
      const inst = curInst;
      const idx = hookIdx++;
      if (!(idx in inst.states)) {
        inst.states[idx] = typeof init === "function" ? init() : init;
      }
      const setState = (next) => {
        inst.states[idx] = typeof next === "function" ? next(inst.states[idx]) : next;
      };
      return [inst.states[idx], setState];
    },
    useReducer(reducer, initArg, init) {
      const inst = curInst;
      const idx = hookIdx++;
      if (!(idx in inst.states)) {
        inst.states[idx] = init ? init(initArg) : initArg;
      }
      const dispatch = (action) => {
        inst.states[idx] = reducer(inst.states[idx], action);
      };
      return [inst.states[idx], dispatch];
    },
    useRef(init) {
      const inst = curInst;
      const idx = hookIdx++;
      if (!(idx in inst.states)) {
        inst.states[idx] = { current: init };
      }
      return inst.states[idx];
    },
    useMemo(fn) {
      return fn();
    },
    useCallback(fn) {
      return fn;
    },
    useId() {
      const idx = hookIdx++;
      return `:r${idx}:`;
    },
    useEffect(cb, deps) {
      const inst = curInst;
      const idx = hookIdx++;
      const prev = inst.effects[idx];
      const changed = !prev
        || !deps
        || !prev.deps
        || deps.length !== prev.deps.length
        || deps.some((d, i) => !Object.is(d, prev.deps[i]));
      if (changed) {
        inst.effects[idx] = { cb, deps, pending: true, cleanup: prev?.cleanup };
      }
    },
    useLayoutEffect(cb, deps) {
      this.useEffect(cb, deps);
    },
  };

  function runComponent(renderFn, props, ref, key) {
    seenPaths.add(key);
    if (!instances.has(key)) {
      instances.set(key, { states: [], effects: [] });
    }
    const prevInst = curInst;
    const prevIdx = hookIdx;
    curInst = instances.get(key);
    hookIdx = 0;
    try {
      return renderFn(props, ref);
    } finally {
      curInst = prevInst;
      hookIdx = prevIdx;
    }
  }

  function expand(node, nodePath) {
    if (!node || typeof node !== "object") {
      return node;
    }
    if (Array.isArray(node)) {
      return node.map((child, i) => expand(child, `${nodePath}/${child?.key ?? i}`));
    }
    if (node.type === React.Fragment) {
      return expand(node.props?.children, `${nodePath}/frag`);
    }
    if (node.type?.$$typeof === MEMO) {
      return expand({ ...node, type: node.type.type }, nodePath);
    }
    if (typeof node.type === "function") {
      const name = node.type.displayName || node.type.name || "Component";
      const key = `${nodePath}:${name}:${node.key ?? ""}`;
      const res = runComponent((p) => node.type(p), node.props || {}, undefined, key);
      const expanded = expand(res, key);
      if (node.key != null && expanded && typeof expanded === "object" && !Array.isArray(expanded)) {
        return React.isValidElement(expanded) ? React.cloneElement(expanded, { key: node.key }) : expanded;
      }
      return expanded;
    }
    if (node.type?.$$typeof === FORWARD_REF) {
      const name = node.type.displayName || node.type.render?.name || "ForwardRef";
      const key = `${nodePath}:${name}:${node.key ?? ""}`;
      const res = runComponent(node.type.render, node.props || {}, node.props?.ref ?? null, key);
      const expanded = expand(res, key);
      if (node.key != null && expanded && typeof expanded === "object" && !Array.isArray(expanded)) {
        return React.isValidElement(expanded) ? React.cloneElement(expanded, { key: node.key }) : expanded;
      }
      return expanded;
    }
    if (
      node.type
      && typeof node.type === "object"
      && (node.type.$$typeof === CONTEXT || node.type.$$typeof === PROVIDER)
    ) {
      const ctx = node.type._context || node.type;
      const prevMap = ctxMap;
      ctxMap = new Map(ctxMap);
      ctxMap.set(ctx, node.props?.value);
      try {
        return expand(node.props?.children, `${nodePath}/ctx`);
      } finally {
        ctxMap = prevMap;
      }
    }
    if (node.props && node.props.children !== undefined) {
      const expandedChildren = expand(node.props.children, `${nodePath}/${String(node.type)}`);
      return {
        ...node,
        props: {
          ...node.props,
          children: expandedChildren,
        },
      };
    }
    return node;
  }

  function renderOnce() {
    seenPaths.clear();
    const prev = internals.H;
    internals.H = dispatcher;
    try {
      tree = expand(
        React.createElement(MemoryRouter, { initialEntries }, React.createElement(RootComponent)),
        "root",
      );
    } finally {
      internals.H = prev;
    }
    for (const [k, inst] of instances) {
      if (!seenPaths.has(k)) {
        for (const ef of inst.effects) {
          if (typeof ef?.cleanup === "function") {
            ef.cleanup();
          }
        }
        instances.delete(k);
      }
    }
    return tree;
  }

  async function settle() {
    for (let pass = 0; pass < 8; pass++) {
      renderOnce();
      let ran = false;
      for (const inst of Array.from(instances.values())) {
        for (const ef of inst.effects) {
          if (ef?.pending) {
            ef.pending = false;
            ran = true;
            if (typeof ef.cleanup === "function") {
              ef.cleanup();
            }
            ef.cleanup = ef.cb();
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
      if (!ran && pass > 0) {
        break;
      }
    }
    return renderOnce();
  }

  function findAll(predicate, node = tree, results = []) {
    if (!node || typeof node !== "object") {
      return results;
    }
    if (Array.isArray(node)) {
      for (const child of node) {
        findAll(predicate, child, results);
      }
      return results;
    }
    if (predicate(node)) {
      results.push(node);
    }
    if (node.props?.children !== undefined) {
      findAll(predicate, node.props.children, results);
    }
    return results;
  }

  function toHtml() {
    renderOnce();
    return renderToStaticMarkup(tree);
  }

  function unmount() {
    for (const inst of instances.values()) {
      for (const ef of inst.effects) {
        if (typeof ef?.cleanup === "function") {
          ef.cleanup();
        }
      }
    }
    instances.clear();
  }

  return { renderOnce, settle, findAll, toHtml, unmount };
}

before(async () => {
  MongoClient.prototype.connect = async function connectStub() {
    return this;
  };
  MongoClient.prototype.db = function dbStub() {
    return memoryDb;
  };
  MongoClient.prototype.close = async function closeStub() {};

  process.env.MONGODB_URI = TEST_URI;
  process.env.SESSION_SECRET = SESSION_FIXTURE;

  const app = await createApp({ dev: false });
  expressServer = app.listen(0);
  expressBaseUrl = `http://127.0.0.1:${expressServer.address().port}`;

  vite = await createViteServer({
    root: "web",
    configFile: "web/vite.config.js",
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    optimizeDeps: { noDiscovery: true },
  });
  ({ default: App } = await vite.ssrLoadModule("/src/App.jsx"));
});

after(async () => {
  MongoClient.prototype.connect = originalConnect;
  MongoClient.prototype.db = originalDb;
  MongoClient.prototype.close = originalClose;
  globalThis.fetch = nativeFetch;
  delete process.env.MONGODB_URI;
  delete process.env.SESSION_SECRET;
  delete process.env.AUTH_BOOTSTRAP_USERNAME;
  delete process.env.AUTH_BOOTSTRAP_EMAIL;
  delete process.env.AUTH_BOOTSTRAP_PASSWORD;
  if (expressServer) {
    await new Promise((resolve) => expressServer.close(resolve));
  }
  if (vite) {
    await vite.close();
  }
});

beforeEach(() => {
  memoryDb.reset();
  process.env.MONGODB_URI = TEST_URI;
  process.env.SESSION_SECRET = SESSION_FIXTURE;
  delete process.env.AUTH_BOOTSTRAP_USERNAME;
  delete process.env.AUTH_BOOTSTRAP_EMAIL;
  delete process.env.AUTH_BOOTSTRAP_PASSWORD;
  workerEnv.MONGODB_URI = TEST_URI;
  workerEnv.MONGODB_DB = "productmanage";
  workerEnv.SESSION_SECRET = SESSION_FIXTURE;
  delete workerEnv.AUTH_BOOTSTRAP_USERNAME;
  delete workerEnv.AUTH_BOOTSTRAP_EMAIL;
  delete workerEnv.AUTH_BOOTSTRAP_PASSWORD;
});

test("admin-authentication: userinfo indexes, duplicate guards, case-insensitive account login, cross-runtime cookies, Secure flag, validation 400s, and fail-closed config", async () => {
  // 1. Verify failed createIndex does NOT set indexesReady, and next call creates all 4 unique ci indexes
  memoryDb.failNextCreateIndex();
  await assert.rejects(() => listCategories(workerEnv), /Simulated index creation failure/);
  memoryDb.createdIndexes.length = 0;

  await listCategories(workerEnv);
  const indexNames = memoryDb.createdIndexes.map((entry) => `${entry.collection}:${entry.options?.name}`);
  assert.deepEqual(indexNames, [
    "categories:category_name_ci",
    "brands:brand_name_ci",
    "userinfo:userinfo_username_ci",
    "userinfo:userinfo_email_ci",
  ]);
  for (const idx of memoryDb.createdIndexes.filter((entry) => entry.collection === "userinfo")) {
    assert.equal(idx.options.unique, true);
    assert.deepEqual(idx.options.collation, { locale: "en", strength: 2 });
  }

  // 2. Verify createUserinfo stores hashed password, omits password fields, and rejects duplicate username/email ignoring case + 11000
  const user = await createUserinfo(workerEnv, {
    username: "  Ada.Admin  ",
    email: "  Ada@Example.com  ",
    password: "  strongPass99  ",
  });
  assert.equal(user.username, "Ada.Admin");
  assert.equal(user.email, "Ada@Example.com");
  assert.equal(user.password, undefined);
  assert.equal(user.passwordHash, undefined);

  const storedRow = memoryDb.dump("userinfo")[0];
  assert.equal(storedRow._id, user.id);
  assert.match(storedRow.passwordHash, /^pbkdf2-sha256\$100000\$[^$]+\$[^$]+$/);
  assert.notEqual(storedRow.passwordHash, "strongPass99");
  assert.ok(storedRow.createdAt);

  await assert.rejects(
    () => createUserinfo(workerEnv, { username: "ADA.ADMIN", email: "other@example.com", password: "password123" }),
    (err) => err.status === 409 && err.message === "A user with that username or email already exists",
  );
  await assert.rejects(
    () => createUserinfo(workerEnv, { username: "other", email: "ADA@EXAMPLE.COM", password: "password123" }),
    (err) => err.status === 409 && err.message === "A user with that username or email already exists",
  );
  memoryDb.failNextInsertWith11000();
  await assert.rejects(
    () => createUserinfo(workerEnv, { username: "uniqueUser", email: "unique@example.com", password: "password123" }),
    (err) => err.status === 409 && err.message === "A user with that username or email already exists",
  );

  // 3. Login via `account` field (username and email, mixed case) on Express and Worker + cross-runtime cookie acceptance
  for (const account of ["  ada.admin  ", "  ADA@EXAMPLE.COM  "]) {
    const expLogin = await nativeFetch(`${expressBaseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account, password: "strongPass99" }),
    });
    assert.equal(expLogin.status, 200);
    const expPayload = await expLogin.json();
    assert.deepEqual(expPayload, {
      user: { id: user.id, username: "Ada.Admin", email: "Ada@Example.com" },
    });
    assert.equal("passwordHash" in expPayload.user, false);
    assert.equal("password" in expPayload.user, false);
    const expCookie = extractCookiePair(expLogin);
    assert.ok(expCookie);

    // Express-issued cookie works on Worker session and Worker catalog write
    const wrkSessFromExp = await callWorker("/api/auth/session", { headers: { cookie: expCookie } });
    assert.equal(wrkSessFromExp.status, 200);
    assert.deepEqual(await wrkSessFromExp.json(), {
      authenticated: true,
      user: { id: user.id, username: "Ada.Admin", email: "Ada@Example.com" },
    });

    const wrkLogin = await callWorker("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account, password: "strongPass99" }),
    });
    assert.equal(wrkLogin.status, 200);
    const wrkPayload = await wrkLogin.json();
    assert.deepEqual(wrkPayload, {
      user: { id: user.id, username: "Ada.Admin", email: "Ada@Example.com" },
    });
    const wrkCookie = extractCookiePair(wrkLogin);
    assert.ok(wrkCookie);

    // Worker-issued cookie works on Express session
    const expSessFromWrk = await nativeFetch(`${expressBaseUrl}/api/auth/session`, {
      headers: { cookie: wrkCookie },
    });
    assert.equal(expSessFromWrk.status, 200);
    assert.deepEqual(await expSessFromWrk.json(), {
      authenticated: true,
      user: { id: user.id, username: "Ada.Admin", email: "Ada@Example.com" },
    });
  }

  // 4. HTTPS X-Forwarded-Proto and https:// URL add `Secure` on both login and logout
  const expHttpsLogin = await nativeFetch(`${expressBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https, http" },
    body: JSON.stringify({ username: "Ada.Admin", password: "strongPass99" }),
  });
  assert.match(getSessionSetCookie(expHttpsLogin), /;\s*Secure\b/);

  const expHttpsLogout = await nativeFetch(`${expressBaseUrl}/api/auth/logout`, {
    method: "POST",
    headers: { "X-Forwarded-Proto": "https" },
  });
  assert.match(getSessionSetCookie(expHttpsLogout), /Max-Age=0;\s*Secure\b/);

  const wrkHttpsLogin = await callWorker(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ada@example.com", password: "strongPass99" }),
    },
    workerEnv,
    "https://worker.local",
  );
  assert.match(getSessionSetCookie(wrkHttpsLogin), /;\s*Secure\b/);

  const wrkHttpsLogout = await callWorker("/api/auth/logout", { method: "POST" }, workerEnv, "https://worker.local");
  assert.match(getSessionSetCookie(wrkHttpsLogout), /Max-Age=0;\s*Secure\b/);

  // 5. Validation 400 matrix on Express & Worker (no cookie created)
  const invalid400Cases = [
    [{}, "Username or email is required"],
    [{ account: "   ", password: "strongPass99" }, "Username or email is required"],
    [{ username: "Ada.Admin", email: "ada@example.com", password: "strongPass99" }, "Provide one username or email"],
    [{ username: "Ada.Admin", account: "Ada.Admin", password: "strongPass99" }, "Provide one username or email"],
    [{ username: "bad space", password: "strongPass99" }, "Username is invalid"],
    [{ username: "bad!char", password: "strongPass99" }, "Username is invalid"],
    [{ username: "a".repeat(65), password: "strongPass99" }, "Username is invalid"],
    [{ account: "bad space", password: "strongPass99" }, "Username is invalid"],
    [{ email: "bad@", password: "strongPass99" }, "Email is invalid"],
    [{ email: "@bad.com", password: "strongPass99" }, "Email is invalid"],
    [{ email: "a@b@c.com", password: "strongPass99" }, "Email is invalid"],
    [{ email: "a b@c.com", password: "strongPass99" }, "Email is invalid"],
    [{ email: `${"a".repeat(250)}@b.com`, password: "strongPass99" }, "Email is invalid"],
    [{ account: "bad@", password: "strongPass99" }, "Email is invalid"],
    [{ username: "Ada.Admin" }, "Password is required"],
    [{ username: "Ada.Admin", password: "   " }, "Password is required"],
    [{ username: "Ada.Admin", password: 12345 }, "Password is required"],
  ];

  for (const [payload, expectedError] of invalid400Cases) {
    const expRes = await nativeFetch(`${expressBaseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert.equal(expRes.status, 400);
    assert.deepEqual(await expRes.json(), { error: expectedError });
    assert.equal(getSessionSetCookie(expRes), "");

    const wrkRes = await callWorker("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert.equal(wrkRes.status, 400);
    assert.deepEqual(await wrkRes.json(), { error: expectedError });
    assert.equal(getSessionSetCookie(wrkRes), "");
  }

  // Stored plaintext/corrupted passwordHash never authenticates
  await memoryDb.collection("userinfo").insertOne({
    _id: "user-plaintext",
    username: "plainuser",
    email: "plain@example.com",
    passwordHash: "plaintext-password",
    createdAt: new Date().toISOString(),
  });
  const plainAttempt = await callWorker("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "plainuser", password: "plaintext-password" }),
  });
  assert.equal(plainAttempt.status, 401);
  assert.deepEqual(await plainAttempt.json(), { error: "Invalid username, email, or password" });
  assert.equal(getSessionSetCookie(plainAttempt), "");

  // 6. Missing / short secret, missing MONGODB_URI, and partial/existing bootstrap fail-closed behavior
  const shortSecretValue = "short-secret-value-31-chars-xyz";
  assert.equal(shortSecretValue.length, 31);
  process.env.SESSION_SECRET = shortSecretValue;
  const shortWorkerEnv = { ...workerEnv, SESSION_SECRET: shortSecretValue };

  for (const [expRes, wrkRes] of [
    [
      await nativeFetch(`${expressBaseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "Ada.Admin", password: "strongPass99" }),
      }),
      await callWorker("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "Ada.Admin", password: "strongPass99" }),
      }, shortWorkerEnv),
    ],
    [
      await nativeFetch(`${expressBaseUrl}/api/auth/session`),
      await callWorker("/api/auth/session", {}, shortWorkerEnv),
    ],
    [
      await nativeFetch(`${expressBaseUrl}/api/brands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Blocked" }),
      }),
      await callWorker("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Blocked" }),
      }, shortWorkerEnv),
    ],
  ]) {
    assert.equal(expRes.status, 500);
    const expText = await expRes.text();
    assert.equal(expText.includes(shortSecretValue), false);
    assert.deepEqual(JSON.parse(expText), { error: "SESSION_SECRET is not set" });

    assert.equal(wrkRes.status, 500);
    const wrkText = await wrkRes.text();
    assert.equal(wrkText.includes(shortSecretValue), false);
    assert.deepEqual(JSON.parse(wrkText), { error: "SESSION_SECRET is not set" });
  }

  // Restore secret, test missing MONGODB_URI on login & signed-cookie session check
  process.env.SESSION_SECRET = SESSION_FIXTURE;
  const validSignedCookie = `admin_session=${signSession(user.id, SESSION_FIXTURE)}`;
  delete process.env.MONGODB_URI;
  const noMongoEnv = { MONGODB_DB: "productmanage", SESSION_SECRET: SESSION_FIXTURE };

  const expNoMongoLogin = await nativeFetch(`${expressBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "Ada.Admin", password: "strongPass99" }),
  });
  assert.equal(expNoMongoLogin.status, 500);
  assert.deepEqual(await expNoMongoLogin.json(), { error: "MONGODB_URI is not set" });

  const wrkNoMongoLogin = await callWorker("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "Ada.Admin", password: "strongPass99" }),
  }, noMongoEnv);
  assert.equal(wrkNoMongoLogin.status, 500);
  assert.deepEqual(await wrkNoMongoLogin.json(), { error: "MONGODB_URI is not set" });

  const expNoMongoSession = await nativeFetch(`${expressBaseUrl}/api/auth/session`, {
    headers: { cookie: validSignedCookie },
  });
  assert.equal(expNoMongoSession.status, 500);
  assert.deepEqual(await expNoMongoSession.json(), { error: "MONGODB_URI is not set" });

  const wrkNoMongoSession = await callWorker("/api/auth/session", {
    headers: { cookie: validSignedCookie },
  }, noMongoEnv);
  assert.equal(wrkNoMongoSession.status, 500);
  assert.deepEqual(await wrkNoMongoSession.json(), { error: "MONGODB_URI is not set" });

  // Anonymous session check when MONGODB_URI is missing still denies auth cleanly
  const expAnonNoMongo = await nativeFetch(`${expressBaseUrl}/api/auth/session`);
  assert.equal(expAnonNoMongo.status, 200);
  assert.deepEqual(await expAnonNoMongo.json(), { authenticated: false });

  // Partial bootstrap over HTTP on empty userinfo returns 500 without leaking bootstrap values; catalog GET still succeeds
  process.env.MONGODB_URI = TEST_URI;
  memoryDb.reset();
  process.env.AUTH_BOOTSTRAP_USERNAME = "bootadmin";
  process.env.AUTH_BOOTSTRAP_EMAIL = "bootadmin@localhost";
  process.env.AUTH_BOOTSTRAP_PASSWORD = "short"; // < 8 chars -> partial/invalid
  const partialWorkerEnv = {
    ...workerEnv,
    AUTH_BOOTSTRAP_USERNAME: "bootadmin",
    AUTH_BOOTSTRAP_EMAIL: "bootadmin@localhost",
    AUTH_BOOTSTRAP_PASSWORD: "short",
  };

  const expBoot500 = await nativeFetch(`${expressBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "bootadmin", password: "password123" }),
  });
  assert.equal(expBoot500.status, 500);
  const expBootText = await expBoot500.text();
  assert.equal(expBootText.includes("short"), false);
  assert.deepEqual(JSON.parse(expBootText), { error: "Admin bootstrap configuration is incomplete" });

  const wrkBoot500 = await callWorker("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "bootadmin", password: "password123" }),
  }, partialWorkerEnv);
  assert.equal(wrkBoot500.status, 500);
  assert.deepEqual(await wrkBoot500.json(), { error: "Admin bootstrap configuration is incomplete" });

  // Public catalog GET still works when bootstrap trio is partial
  const pubGetPartial = await callWorker("/api/brands", {}, partialWorkerEnv);
  assert.equal(pubGetPartial.status, 200);
  assert.equal(memoryDb.dump("userinfo").length, 0);

  // When an account already exists, partial or valid bootstrap inserts nothing and existing user can log in
  await createUserinfo(workerEnv, {
    username: "existingadmin",
    email: "existing@example.com",
    password: "password123",
  });
  const okWithPartial = await callWorker("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "existingadmin", password: "password123" }),
  }, partialWorkerEnv);
  assert.equal(okWithPartial.status, 200);
  assert.equal(memoryDb.dump("userinfo").length, 1);

  await listBrands({
    ...workerEnv,
    AUTH_BOOTSTRAP_USERNAME: "secondadmin",
    AUTH_BOOTSTRAP_EMAIL: "second@example.com",
    AUTH_BOOTSTRAP_PASSWORD: "password123",
  });
  assert.equal(memoryDb.dump("userinfo").length, 1);
});

test("Serve Login page at /login, guarded admin HTML routes, public Dashboard HTML, and secret-free config files (Express & Worker ASSETS)", async () => {
  const admin = await createUserinfo(workerEnv, {
    username: "ada",
    email: "ada@example.com",
    password: "password123",
  });
  const validCookie = `admin_session=${signSession(admin.id, SESSION_FIXTURE)}`;
  const expiredCookie = `admin_session=${signSession(admin.id, SESSION_FIXTURE, Date.now() - 28805 * 1000)}`;
  const [payloadPart, macPart] = validCookie.slice("admin_session=".length).split(".");
  const badMac = Buffer.from(macPart, "base64url");
  badMac[0] ^= 0xff;
  const tamperedCookie = `admin_session=${payloadPart}.${badMac.toString("base64url")}`;

  const workerWithAssets = {
    ...workerEnv,
    ASSETS: {
      async fetch(req) {
        return new Response(`<!doctype html><html><head><title>Products</title></head><body><div id="root" data-path="${new URL(req.url).pathname}"></div></body></html>`, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      },
    },
  };

  const distDir = path.resolve("web", "dist");
  const distIndex = path.join(distDir, "index.html");
  const hadDist = fs.existsSync(distIndex);
  if (!hadDist) {
    fs.mkdirSync(distDir, { recursive: true });
    fs.copyFileSync(path.resolve("web", "index.html"), distIndex);
  }

  try {
    // 1. Unauthenticated GET /login -> HTTP 200 HTML on Express and Worker (ASSETS)
    const expLogin200 = await nativeFetch(`${expressBaseUrl}/login`, { redirect: "manual" });
    assert.equal(expLogin200.status, 200);
    assert.match(expLogin200.headers.get("content-type") || "", /text\/html/);
    const expLoginHtml = await expLogin200.text();
    assert.ok(expLoginHtml.includes('<div id="root"></div>'));

    const wrkLogin200 = await callWorker("/login", {}, workerWithAssets);
    assert.equal(wrkLogin200.status, 200);
    assert.match(wrkLogin200.headers.get("content-type") || "", /text\/html/);
    assert.match(await wrkLogin200.text(), /data-path="\/login"/);

    // 2. Authenticated GET /login -> HTTP 302 Location: /products on Express and Worker
    const expLogin302 = await nativeFetch(`${expressBaseUrl}/login`, {
      redirect: "manual",
      headers: { cookie: validCookie },
    });
    assert.equal(expLogin302.status, 302);
    assert.equal(locationPath(expLogin302), "/products");

    const wrkLogin302 = await callWorker("/login", { headers: { cookie: validCookie } }, workerWithAssets);
    assert.equal(wrkLogin302.status, 302);
    assert.equal(locationPath(wrkLogin302), "/products");

    // 3. Admin pages (/products, /brands, /categories): unauthenticated, expired, tampered, malformed -> 302 /login; valid -> 200 HTML
    for (const adminPath of ["/products", "/brands", "/categories"]) {
      for (const badHeader of [undefined, expiredCookie, tamperedCookie, "admin_session=malformed"]) {
        const headers = badHeader ? { cookie: badHeader } : undefined;
        const exp302 = await nativeFetch(`${expressBaseUrl}${adminPath}`, { redirect: "manual", headers });
        assert.equal(exp302.status, 302);
        assert.equal(locationPath(exp302), "/login");

        const wrk302 = await callWorker(adminPath, { headers }, workerWithAssets);
        assert.equal(wrk302.status, 302);
        assert.equal(locationPath(wrk302), "/login");
      }

      const exp200 = await nativeFetch(`${expressBaseUrl}${adminPath}`, {
        redirect: "manual",
        headers: { cookie: validCookie },
      });
      assert.equal(exp200.status, 200);
      assert.match(exp200.headers.get("content-type") || "", /text\/html/);

      const wrk200 = await callWorker(adminPath, { headers: { cookie: validCookie } }, workerWithAssets);
      assert.equal(wrk200.status, 200);
      assert.match(await wrk200.text(), new RegExp(`data-path="${adminPath}"`));
    }

    // 4. GET /dashboard returns 200 HTML both logged out and logged in
    for (const headers of [undefined, { cookie: validCookie }]) {
      const expDash = await nativeFetch(`${expressBaseUrl}/dashboard`, { redirect: "manual", headers });
      assert.equal(expDash.status, 200);
      assert.match(expDash.headers.get("content-type") || "", /text\/html/);

      const wrkDash = await callWorker("/dashboard", { headers }, workerWithAssets);
      assert.equal(wrkDash.status, 200);
    }
  } finally {
    if (!hadDist) {
      fs.rmSync(distDir, { recursive: true, force: true });
    }
  }

  // GET / returns 302 /dashboard both logged out and logged in on Express and Worker
  for (const headers of [undefined, { cookie: validCookie }]) {
    const expRoot = await nativeFetch(`${expressBaseUrl}/`, { redirect: "manual", headers });
    assert.equal(expRoot.status, 302);
    assert.equal(locationPath(expRoot), "/dashboard");

    const wrkRoot = await callWorker("/", { headers }, workerWithAssets);
    assert.equal(wrkRoot.status, 302);
    assert.equal(locationPath(wrkRoot), "/dashboard");
  }

  // 5. Verify wrangler.toml and example env files contain required routing/placeholders and zero secrets
  const wranglerToml = fs.readFileSync(path.resolve("wrangler.toml"), "utf8");
  for (const routeEntry of ["/", "/api", "/api/*", "/login", "/products", "/brands", "/categories"]) {
    assert.ok(wranglerToml.includes(`"${routeEntry}"`), `wrangler.toml missing run_worker_first path ${routeEntry}`);
  }
  assert.equal(/^\s*SESSION_SECRET\s*=/m.test(wranglerToml), false);
  assert.equal(/^\s*AUTH_BOOTSTRAP_PASSWORD\s*=/m.test(wranglerToml), false);
  assert.equal(/^\s*MONGODB_URI\s*=/m.test(wranglerToml), false);

  for (const exampleFile of [".env.example", ".dev.vars.example"]) {
    const text = fs.readFileSync(path.resolve(exampleFile), "utf8");
    assert.match(text, /^SESSION_SECRET=$/m);
    assert.match(text, /^AUTH_BOOTSTRAP_USERNAME=$/m);
    assert.match(text, /^AUTH_BOOTSTRAP_EMAIL=$/m);
    assert.match(text, /^AUTH_BOOTSTRAP_PASSWORD=$/m);
  }
});

test("Complete catalog write-guard matrix (POST/PUT/DELETE 401 for anonymous, expired, tampered, and deleted-user cookies) and full product Delete & category CRUD parity", async () => {
  // 1. Seed starter catalog via public unauthenticated GETs on Express & Worker
  for (const apiPath of ["/api/products", "/api/brands", "/api/categories"]) {
    const expGet = await nativeFetch(`${expressBaseUrl}${apiPath}`);
    assert.equal(expGet.status, 200);
    const expItems = (await expGet.json()).items;
    assert.ok(Array.isArray(expItems) && expItems.length > 0);

    const wrkGet = await callWorker(apiPath);
    assert.equal(wrkGet.status, 200);
    const wrkItems = (await wrkGet.json()).items;
    assert.equal(wrkItems.length, expItems.length);
  }

  // Prepare expired, tampered, malformed, cleared, and deleted-user cookies
  const tempUser = await createUserinfo(workerEnv, {
    username: "ghost",
    email: "ghost@example.com",
    password: "password123",
  });
  const deletedUserCookie = `admin_session=${signSession(tempUser.id, SESSION_FIXTURE)}`;
  await memoryDb.collection("userinfo").deleteOne({ _id: tempUser.id });

  const admin = await createUserinfo(workerEnv, {
    username: "ada",
    email: "ada@example.com",
    password: "password123",
  });
  const validToken = signSession(admin.id, SESSION_FIXTURE);
  const validCookie = `admin_session=${validToken}`;
  const expiredCookie = `admin_session=${signSession(admin.id, SESSION_FIXTURE, Date.now() - 29000 * 1000)}`;
  const [pSeg, mSeg] = validToken.split(".");
  const mBuf = Buffer.from(mSeg, "base64url");
  mBuf[0] ^= 0xff;
  const tamperedCookie = `admin_session=${pSeg}.${mBuf.toString("base64url")}`;

  const writeTargets = [
    ["POST", "/api/products", { name: "Blocked", brandId: "brand-samsung", categoryId: "cat-electronics", price: 10, quantity: 1 }],
    ["PUT", "/api/products/prod-mouse", { name: "Blocked", brandId: "brand-samsung", categoryId: "cat-electronics", price: 10, quantity: 1 }],
    ["DELETE", "/api/products/prod-mouse", null],
    ["POST", "/api/brands", { name: "Blocked Brand", description: "" }],
    ["PUT", "/api/brands/brand-samsung", { name: "Blocked Samsung", description: "" }],
    ["DELETE", "/api/brands/brand-casper", null],
    ["POST", "/api/categories", { name: "Blocked Cat", description: "" }],
    ["PUT", "/api/categories/cat-books", { name: "Blocked Books", description: "" }],
    ["DELETE", "/api/categories/cat-books", null],
  ];

  const snapshotBefore = {
    products: memoryDb.dump("products"),
    brands: memoryDb.dump("brands"),
    categories: memoryDb.dump("categories"),
  };

  // 2. Verify all 9 write operations fail with 401 across anonymous + all invalid cookies on BOTH Express & Worker
  for (const badCookie of [undefined, "admin_session=", "admin_session=not-valid", expiredCookie, tamperedCookie, deletedUserCookie]) {
    for (const [method, targetPath, bodyObj] of writeTargets) {
      const headers = {
        ...(bodyObj ? { "Content-Type": "application/json" } : {}),
        ...(badCookie ? { cookie: badCookie } : {}),
      };
      const init = {
        method,
        headers,
        ...(bodyObj ? { body: JSON.stringify(bodyObj) } : {}),
      };

      const exp401 = await nativeFetch(`${expressBaseUrl}${targetPath}`, init);
      assert.equal(exp401.status, 401, `Expected 401 on Express ${method} ${targetPath}`);
      assert.deepEqual(await exp401.json(), { error: "Authentication required" });

      const wrk401 = await callWorker(targetPath, init);
      assert.equal(wrk401.status, 401, `Expected 401 on Worker ${method} ${targetPath}`);
      assert.deepEqual(await wrk401.json(), { error: "Authentication required" });
    }
  }

  assert.deepEqual(memoryDb.dump("products"), snapshotBefore.products);
  assert.deepEqual(memoryDb.dump("brands"), snapshotBefore.brands);
  assert.deepEqual(memoryDb.dump("categories"), snapshotBefore.categories);

  // 3. Authenticated product-management DELETE scenarios on Express and Worker (200 existing, 404 missing)
  const createProdExp = await nativeFetch(`${expressBaseUrl}/api/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: validCookie },
    body: JSON.stringify({
      name: "Temp Exp Product",
      brandId: "brand-samsung",
      categoryId: "cat-electronics",
      price: 19.99,
      quantity: 2,
    }),
  });
  assert.equal(createProdExp.status, 201);
  const { item: prodExp } = await createProdExp.json();

  const delProdExp = await nativeFetch(`${expressBaseUrl}/api/products/${prodExp.id}`, {
    method: "DELETE",
    headers: { cookie: validCookie },
  });
  assert.equal(delProdExp.status, 200);
  assert.deepEqual(await delProdExp.json(), { deleted: true });

  const delProdExp404 = await nativeFetch(`${expressBaseUrl}/api/products/${prodExp.id}`, {
    method: "DELETE",
    headers: { cookie: validCookie },
  });
  assert.equal(delProdExp404.status, 404);
  assert.deepEqual(await delProdExp404.json(), { error: "Product not found" });

  const createProdWrk = await callWorker("/api/products", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: validCookie },
    body: JSON.stringify({
      name: "Temp Wrk Product",
      brandId: "brand-sony",
      categoryId: "cat-books",
      price: 12,
      quantity: 1,
    }),
  });
  assert.equal(createProdWrk.status, 201);
  const { item: prodWrk } = await createProdWrk.json();

  const delProdWrk = await callWorker(`/api/products/${prodWrk.id}`, {
    method: "DELETE",
    headers: { cookie: validCookie },
  });
  assert.equal(delProdWrk.status, 200);
  assert.deepEqual(await delProdWrk.json(), { deleted: true });

  const delProdWrk404 = await callWorker(`/api/products/${prodWrk.id}`, {
    method: "DELETE",
    headers: { cookie: validCookie },
  });
  assert.equal(delProdWrk404.status, 404);
  assert.deepEqual(await delProdWrk404.json(), { error: "Product not found" });

  // 4. Authenticated category-management CRUD scenarios on Express and Worker
  // Create valid category (Express & Worker)
  const expCatCreate = await nativeFetch(`${expressBaseUrl}/api/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: validCookie },
    body: JSON.stringify({ name: "  Garden  ", description: "  Outdoor tools  " }),
  });
  assert.equal(expCatCreate.status, 201);
  const { item: gardenCat } = await expCatCreate.json();
  assert.equal(gardenCat.name, "Garden");
  assert.equal(gardenCat.description, "Outdoor tools");
  assert.equal(gardenCat.productCount, 0);
  assert.ok(gardenCat.id && gardenCat.createdAt);

  const wrkCatCreate = await callWorker("/api/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: validCookie },
    body: JSON.stringify({ name: "  Office  ", description: "  Desk supplies  " }),
  });
  assert.equal(wrkCatCreate.status, 201);
  const { item: officeCat } = await wrkCatCreate.json();
  assert.equal(officeCat.name, "Office");
  assert.equal(officeCat.description, "Desk supplies");
  assert.equal(officeCat.productCount, 0);

  // Reject missing category name (400)
  for (const blank of ["", "   "]) {
    const exp400 = await nativeFetch(`${expressBaseUrl}/api/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: validCookie },
      body: JSON.stringify({ name: blank }),
    });
    assert.equal(exp400.status, 400);
    assert.deepEqual(await exp400.json(), { error: "Name is required" });

    const wrk400 = await callWorker("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: validCookie },
      body: JSON.stringify({ name: blank }),
    });
    assert.equal(wrk400.status, 400);
    assert.deepEqual(await wrk400.json(), { error: "Name is required" });
  }

  // Reject duplicate category name ignoring case (409)
  const expCatDup = await nativeFetch(`${expressBaseUrl}/api/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: validCookie },
    body: JSON.stringify({ name: " electronics " }),
  });
  assert.equal(expCatDup.status, 409);
  assert.deepEqual(await expCatDup.json(), { error: "A category with that name already exists" });

  const wrkCatDup = await callWorker("/api/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: validCookie },
    body: JSON.stringify({ name: "GARDEN" }),
  });
  assert.equal(wrkCatDup.status, 409);
  assert.deepEqual(await wrkCatDup.json(), { error: "A category with that name already exists" });

  // Update category name and description + preserve productCount (200)
  const expCatPut = await nativeFetch(`${expressBaseUrl}/api/categories/cat-electronics`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", cookie: validCookie },
    body: JSON.stringify({ name: "Consumer Electronics", description: "Updated gadgets" }),
  });
  assert.equal(expCatPut.status, 200);
  const { item: updatedElec } = await expCatPut.json();
  assert.equal(updatedElec.name, "Consumer Electronics");
  assert.equal(updatedElec.description, "Updated gadgets");
  assert.equal(updatedElec.productCount, 1);
  assert.ok(updatedElec.updatedAt);

  const wrkCatPut = await callWorker(`/api/categories/${officeCat.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", cookie: validCookie },
    body: JSON.stringify({ name: "office", description: "Case-only rename" }),
  });
  assert.equal(wrkCatPut.status, 200);
  const { item: updatedOffice } = await wrkCatPut.json();
  assert.equal(updatedOffice.name, "office");
  assert.equal(updatedOffice.productCount, 0);
  assert.ok(updatedOffice.updatedAt);

  // Update non-existent category (404)
  const expCatPut404 = await nativeFetch(`${expressBaseUrl}/api/categories/missing-cat`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", cookie: validCookie },
    body: JSON.stringify({ name: "Valid" }),
  });
  assert.equal(expCatPut404.status, 404);
  assert.deepEqual(await expCatPut404.json(), { error: "Category not found" });

  const wrkCatPut404 = await callWorker("/api/categories/missing-cat", {
    method: "PUT",
    headers: { "Content-Type": "application/json", cookie: validCookie },
    body: JSON.stringify({ name: "Valid" }),
  });
  assert.equal(wrkCatPut404.status, 404);
  assert.deepEqual(await wrkCatPut404.json(), { error: "Category not found" });

  // Reject rename to an existing category name ignoring case (409)
  const expCatPut409 = await nativeFetch(`${expressBaseUrl}/api/categories/${gardenCat.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", cookie: validCookie },
    body: JSON.stringify({ name: " books " }),
  });
  assert.equal(expCatPut409.status, 409);
  assert.deepEqual(await expCatPut409.json(), { error: "A category with that name already exists" });

  const wrkCatPut409 = await callWorker(`/api/categories/${officeCat.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", cookie: validCookie },
    body: JSON.stringify({ name: "CONSUMER ELECTRONICS" }),
  });
  assert.equal(wrkCatPut409.status, 409);
  assert.deepEqual(await wrkCatPut409.json(), { error: "A category with that name already exists" });

  // Block deletion of category with assigned products (409)
  const expCatDel409 = await nativeFetch(`${expressBaseUrl}/api/categories/cat-electronics`, {
    method: "DELETE",
    headers: { cookie: validCookie },
  });
  assert.equal(expCatDel409.status, 409);
  assert.deepEqual(await expCatDel409.json(), { error: "Move or delete products in this category first" });

  const wrkCatDel409 = await callWorker("/api/categories/cat-books", {
    method: "DELETE",
    headers: { cookie: validCookie },
  });
  assert.equal(wrkCatDel409.status, 409);
  assert.deepEqual(await wrkCatDel409.json(), { error: "Move or delete products in this category first" });

  // Delete category with zero products (200)
  const expCatDel200 = await nativeFetch(`${expressBaseUrl}/api/categories/${gardenCat.id}`, {
    method: "DELETE",
    headers: { cookie: validCookie },
  });
  assert.equal(expCatDel200.status, 200);
  assert.deepEqual(await expCatDel200.json(), { deleted: true });

  const wrkCatDel200 = await callWorker(`/api/categories/${officeCat.id}`, {
    method: "DELETE",
    headers: { cookie: validCookie },
  });
  assert.equal(wrkCatDel200.status, 200);
  assert.deepEqual(await wrkCatDel200.json(), { deleted: true });

  // Delete non-existent category (404)
  const expCatDel404 = await nativeFetch(`${expressBaseUrl}/api/categories/missing-cat`, {
    method: "DELETE",
    headers: { cookie: validCookie },
  });
  assert.equal(expCatDel404.status, 404);
  assert.deepEqual(await expCatDel404.json(), { error: "Category not found" });

  const wrkCatDel404 = await callWorker("/api/categories/missing-cat", {
    method: "DELETE",
    headers: { cookie: validCookie },
  });
  assert.equal(wrkCatDel404.status, 404);
  assert.deepEqual(await wrkCatDel404.json(), { error: "Category not found" });
});

test("End-to-end React Router + App journeys: public Dashboard browsing, Login/Logout nav control, /login username & email sign-in, admin session across Products/Brands/Categories, and Categories UI CRUD", async () => {
  const origDocument = globalThis.document;
  const origWindow = globalThis.window;
  let cookieJar = "";
  let failLogoutOnce = false;
  let failSessionOnce = false;
  const confirmCalls = [];
  let confirmResult = true;

  globalThis.document = { title: "Products" };
  globalThis.window = {
    confirm(msg) {
      confirmCalls.push(msg);
      return confirmResult;
    },
  };

  globalThis.fetch = async (input, init = {}) => {
    const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url || "";
    if (failSessionOnce && rawUrl === "/api/auth/session") {
      failSessionOnce = false;
      return new Response(JSON.stringify({ error: "SESSION_SECRET is not set" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (failLogoutOnce && rawUrl === "/api/auth/logout") {
      failLogoutOnce = false;
      return new Response(JSON.stringify({ error: "Logout temporarily unavailable" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    const fullUrl = rawUrl.startsWith("/") ? `${expressBaseUrl}${rawUrl}` : rawUrl;
    const headers = new Headers(init.headers || {});
    if (cookieJar && !headers.has("cookie")) {
      headers.set("cookie", cookieJar);
    }
    const response = await nativeFetch(fullUrl, { ...init, headers });
    const setCookie = getSessionSetCookie(response);
    if (setCookie) {
      if (/Max-Age=0\b/i.test(setCookie)) {
        cookieJar = "";
      } else {
        const pair = extractCookiePair(response);
        if (pair) {
          cookieJar = pair;
        }
      }
    }
    return response;
  };

  try {
    await createUserinfo(workerEnv, {
      username: "Ada",
      email: "Ada@Example.com",
      password: "password123",
    });

    // 1. Root `/` redirects unauthenticated visitor to `/dashboard`; public browsing, sorting, filtering, chips, wishlist, and Login button work
    const rootView = mountRouterApp(App, ["/"]);
    await rootView.settle();
    assert.equal(globalThis.document.title, "Dashboard");
    let html = rootView.toHtml();
    assert.ok(html.includes('<main class="page page-dashboard">'));
    assert.ok(!html.includes("<h1>"));
    assert.ok(html.includes('<button type="button" class="nav-auth">Login</button>'));
    assert.ok(html.includes("3 items"));

    const navLabels = [...html.matchAll(/<a [^>]*class="nav-link(?: active)?"[^>]*>([^<]+)<\/a>/g)].map((m) => m[1]);
    assert.deepEqual(navLabels, ["Dashboard"]);

    // Sort by Price:High-Low on public Dashboard
    const sortRadios = rootView.findAll((n) => n.type === "input" && n.props?.type === "radio");
    sortRadios[2].props.onChange(); // price-desc
    html = rootView.toHtml();
    assert.ok(html.includes("Desk Lamp"));

    // Toggle wishlist heart on first card as unauthenticated visitor
    const heartBtns = rootView.findAll((n) => n.type === "button" && /\bheart\b/.test(String(n.props?.className || "")));
    assert.ok(heartBtns.length > 0);
    assert.equal(heartBtns[0].props["aria-pressed"], false);
    heartBtns[0].props.onClick();
    html = rootView.toHtml();
    assert.ok(html.includes('aria-pressed="true"'));

    // Filter by Samsung brand on public Dashboard and remove chip
    const checkboxes = rootView.findAll((n) => n.type === "input" && n.props?.type === "checkbox");
    checkboxes[5].props.onChange(); // Samsung
    html = rootView.toHtml();
    assert.ok(html.includes("1 items"));
    assert.ok(html.includes("Wireless Mouse"));
    const removeSamsung = rootView.findAll((n) => n.type === "button" && n.props?.["aria-label"] === "Remove Samsung")[0];
    removeSamsung.props.onClick();
    assert.ok(rootView.toHtml().includes("3 items"));
    rootView.unmount();

    // Verify unknown client path routes to `/dashboard`, and failed `/api/auth/session` does NOT pollute Dashboard error state
    failSessionOnce = true;
    const unknownView = mountRouterApp(App, ["/does-not-exist"]);
    await unknownView.settle();
    assert.equal(globalThis.document.title, "Dashboard");
    html = unknownView.toHtml();
    assert.ok(html.includes("3 items"));
    assert.ok(html.includes('<button type="button" class="nav-auth">Login</button>'));
    assert.equal(html.includes('class="message error"'), false);
    unknownView.unmount();

    // 2. Unauthenticated direct navigation to `/products`, `/brands`, and `/categories` redirects to `/login` without rendering management controls
    for (const protectedPath of ["/products", "/brands", "/categories"]) {
      const guarded = mountRouterApp(App, [protectedPath]);
      // Before session settles, AdminRoute renders null (no management table or Add button)
      const initialHtml = guarded.toHtml();
      assert.equal(initialHtml.includes("<table"), false);
      assert.equal(initialHtml.includes(">Add<"), false);
      await guarded.settle();
      assert.equal(globalThis.document.title, "Login");
      const settledHtml = guarded.toHtml();
      assert.ok(settledHtml.includes("<h1>Login</h1>"));
      assert.ok(settledHtml.includes('name="account"'));
      assert.equal(settledHtml.includes("<table"), false);
      guarded.unmount();
    }

    // 3. Clicking `Login` button on `/dashboard` navigates client-side to `/login` (not `/dashboard`), then signing in with USERNAME opens `/products`
    const app = mountRouterApp(App, ["/dashboard"]);
    await app.settle();
    assert.equal(globalThis.document.title, "Dashboard");

    const navLinksLoggedOut = app.findAll((n) => n.type === "a" && String(n.props?.className || "").includes("nav-link"));
    assert.deepEqual(navLinksLoggedOut.map((link) => link.props?.children), ["Dashboard"]);

    const loginBtn = app.findAll((n) => n.type === "button" && n.props?.className === "nav-auth")[0];
    assert.equal(loginBtn.props.children, "Login");
    loginBtn.props.onClick();
    await app.settle();
    assert.equal(globalThis.document.title, "Login");
    html = app.toHtml();
    assert.ok(html.includes("<h1>Login</h1>"));

    // Submit blank credentials -> HTTP 400 in `.message.error`, stays on `/login`
    let loginForm = app.findAll((n) => n.type === "form")[0];
    await loginForm.props.onSubmit({ preventDefault() {} });
    await app.settle();
    html = app.toHtml();
    assert.ok(html.includes('<p class="message error">Username or email is required</p>'));
    assert.equal(globalThis.document.title, "Login");

    // Submit wrong password -> HTTP 401 in `.message.error`, stays on `/login`
    let accountInput = app.findAll((n) => n.type === "input" && n.props?.name === "account")[0];
    let passwordInput = app.findAll((n) => n.type === "input" && n.props?.name === "password")[0];
    accountInput.props.onChange({ target: { value: "Ada" } });
    passwordInput.props.onChange({ target: { value: "wrong-pass" } });
    app.renderOnce();
    loginForm = app.findAll((n) => n.type === "form")[0];
    await loginForm.props.onSubmit({ preventDefault() {} });
    await app.settle();
    html = app.toHtml();
    assert.ok(html.includes('<p class="message error">Invalid username, email, or password</p>'));
    assert.equal(globalThis.document.title, "Login");
    assert.equal(cookieJar, "");

    // Submit valid USERNAME + password -> sets cookie, changes nav to `Logout`, redirects to `/products`
    passwordInput = app.findAll((n) => n.type === "input" && n.props?.name === "password")[0];
    passwordInput.props.onChange({ target: { value: "password123" } });
    app.renderOnce();
    loginForm = app.findAll((n) => n.type === "form")[0];
    await loginForm.props.onSubmit({ preventDefault() {} });
    await app.settle();

    assert.ok(cookieJar.startsWith("admin_session="));
    assert.equal(globalThis.document.title, "Products");
    html = app.toHtml();
    const signedInNav = [...html.matchAll(/<a [^>]*class="nav-link(?: active)?"[^>]*>([^<]+)<\/a>/g)].map((m) => m[1]);
    assert.deepEqual(signedInNav, ["Dashboard", "Products", "Brands", "Categories"]);
    assert.ok(html.includes("<h1>Products</h1>"));
    assert.ok(html.includes('<button type="button" class="nav-auth">Logout</button>'));
    assert.ok(html.includes("Wireless Mouse"));
    assert.ok(html.includes("Samsung"));

    // 4. Navigate across `/brands` and `/categories` as authenticated admin, and exercise `/categories` UI Add/Edit/Delete
    const brandsLink = app.findAll((n) => n.type === "a" && n.props?.children === "Brands")[0];
    brandsLink.props.onClick({ preventDefault() {}, button: 0 });
    await app.settle();
    assert.equal(globalThis.document.title, "Brands");
    assert.ok(app.toHtml().includes("<h1>Brands</h1>"));

    const categoriesLink = app.findAll((n) => n.type === "a" && n.props?.children === "Categories")[0];
    categoriesLink.props.onClick({ preventDefault() {}, button: 0 });
    await app.settle();
    assert.equal(globalThis.document.title, "Categories");
    html = app.toHtml();
    assert.ok(html.includes("<h1>Categories</h1>"));
    const catHeaders = [...html.matchAll(/<th[^>]*>([^<]+)<\/th>/g)].map((m) => m[1]);
    assert.deepEqual(catHeaders, ["No", "Name", "Description", "Products", "Action"]);
    assert.ok(html.includes("Electronics"));

    // Categories UI: Add -> Edit -> Delete (cancel, confirm empty, confirm non-empty 409)
    const addCatBtn = app.findAll((n) => n.type === "button" && n.props?.children === "Add")[0];
    addCatBtn.props.onClick();
    app.renderOnce();
    const catNameInput = app.findAll((n) => n.type === "input")[0];
    const catDescInput = app.findAll((n) => n.type === "textarea")[0];
    catNameInput.props.onChange({ target: { value: "Accessories" } });
    catDescInput.props.onChange({ target: { value: "Cables and adapters" } });
    app.renderOnce();
    let catForm = app.findAll((n) => n.type === "form")[0];
    await catForm.props.onSubmit({ preventDefault() {} });
    await app.settle();
    assert.ok(app.toHtml().includes("Accessories"));

    // Edit newly added category
    const editCatBtns = app.findAll((n) => n.type === "button" && n.props?.["aria-label"] === "Edit");
    editCatBtns[0].props.onClick();
    app.renderOnce();
    const editCatName = app.findAll((n) => n.type === "input")[0];
    editCatName.props.onChange({ target: { value: "Audio & Video" } });
    app.renderOnce();
    catForm = app.findAll((n) => n.type === "form")[0];
    await catForm.props.onSubmit({ preventDefault() {} });
    await app.settle();
    assert.ok(app.toHtml().includes("Audio &amp; Video"));

    // Cancel delete confirmation -> retains row
    confirmResult = false;
    let delCatBtns = app.findAll((n) => n.type === "button" && n.props?.["aria-label"] === "Delete");
    await delCatBtns[0].props.onClick();
    assert.equal(confirmCalls.at(-1), "Delete Audio & Video?");
    assert.ok(app.toHtml().includes("Audio &amp; Video"));

    // Confirm delete on empty category -> removes row
    confirmResult = true;
    delCatBtns = app.findAll((n) => n.type === "button" && n.props?.["aria-label"] === "Delete");
    await delCatBtns[0].props.onClick();
    await app.settle();
    assert.equal(app.toHtml().includes("Audio &amp; Video"), false);

    // Confirm delete on Electronics (has 1 product) -> displays 409 in `.message.error` and retains row
    delCatBtns = app.findAll((n) => n.type === "button" && n.props?.["aria-label"] === "Delete");
    await delCatBtns[0].props.onClick();
    await app.settle();
    assert.ok(app.toHtml().includes('<p class="message error">Move or delete products in this category first</p>'));
    assert.ok(app.toHtml().includes("Electronics"));

    // 5. Already-authenticated admin visiting `/login` client-side redirects immediately to `/products`
    const authedLoginVisit = mountRouterApp(App, ["/login"]);
    await authedLoginVisit.settle();
    assert.equal(globalThis.document.title, "Products");
    assert.ok(authedLoginVisit.toHtml().includes("<h1>Products</h1>"));
    authedLoginVisit.unmount();

    // 6. Logout from an admin page (`/categories`) clears session, opens `/dashboard`, and shows `Login` again
    const logoutFromAdmin = app.findAll((n) => n.type === "button" && n.props?.className === "nav-auth")[0];
    assert.equal(logoutFromAdmin.props.children, "Logout");
    await logoutFromAdmin.props.onClick();
    await app.settle();

    assert.equal(cookieJar, "");
    assert.equal(globalThis.document.title, "Dashboard");
    html = app.toHtml();
    assert.ok(html.includes('<button type="button" class="nav-auth">Login</button>'));
    assert.ok(html.includes("3 items"));
    app.unmount();

    // 7. Sign in with EMAIL + password on `/login` -> redirects to `/products`, navigate to `/dashboard`, verify failed logout error then successful Logout on `/dashboard`
    const emailFlow = mountRouterApp(App, ["/login"]);
    await emailFlow.settle();
    assert.equal(globalThis.document.title, "Login");

    accountInput = emailFlow.findAll((n) => n.type === "input" && n.props?.name === "account")[0];
    passwordInput = emailFlow.findAll((n) => n.type === "input" && n.props?.name === "password")[0];
    accountInput.props.onChange({ target: { value: "  ADA@EXAMPLE.COM  " } });
    passwordInput.props.onChange({ target: { value: "password123" } });
    emailFlow.renderOnce();
    loginForm = emailFlow.findAll((n) => n.type === "form")[0];
    await loginForm.props.onSubmit({ preventDefault() {} });
    await emailFlow.settle();

    assert.ok(cookieJar.startsWith("admin_session="));
    assert.equal(globalThis.document.title, "Products");

    // Navigate to `/dashboard` while logged in -> `Logout` is rendered alongside storefront
    const dashLinkAuthed = emailFlow.findAll((n) => n.type === "a" && n.props?.children === "Dashboard")[0];
    dashLinkAuthed.props.onClick({ preventDefault() {}, button: 0 });
    await emailFlow.settle();
    assert.equal(globalThis.document.title, "Dashboard");
    html = emailFlow.toHtml();
    assert.ok(html.includes('<button type="button" class="nav-auth">Logout</button>'));
    assert.ok(html.includes("3 items"));

    // Failed logout displays `.message.error` and keeps session active
    failLogoutOnce = true;
    let dashLogoutBtn = emailFlow.findAll((n) => n.type === "button" && n.props?.className === "nav-auth")[0];
    await dashLogoutBtn.props.onClick();
    await emailFlow.settle();
    html = emailFlow.toHtml();
    assert.ok(html.includes('<p class="message error">Logout temporarily unavailable</p>'));
    assert.ok(html.includes('<button type="button" class="nav-auth">Logout</button>'));
    assert.ok(cookieJar.startsWith("admin_session="));

    // Succeeding Logout from `/dashboard` clears session, keeps `/dashboard` open, and displays `Login` again
    dashLogoutBtn = emailFlow.findAll((n) => n.type === "button" && n.props?.className === "nav-auth")[0];
    await dashLogoutBtn.props.onClick();
    await emailFlow.settle();
    assert.equal(cookieJar, "");
    assert.equal(globalThis.document.title, "Dashboard");
    html = emailFlow.toHtml();
    assert.ok(html.includes('<button type="button" class="nav-auth">Login</button>'));
    assert.ok(html.includes("3 items"));
    assert.equal(html.includes("Logout temporarily unavailable"), false);
    emailFlow.unmount();
  } finally {
    globalThis.document = origDocument;
    globalThis.window = origWindow;
    globalThis.fetch = nativeFetch;
  }
});
