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
import { createUserinfo } from "./store.js";
import worker from "./worker.js";

/**
 * Create an in-memory MongoDB database harness compatible with `src/store.js`.
 */
function createMemoryDatabase() {
  const collections = new Map();

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
      if (key === "name" && options?.collation?.strength === 2) {
        if (String(doc.name ?? "").toLowerCase() !== String(condition ?? "").toLowerCase()) {
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
    reset() {
      collections.clear();
    },
    dump(name) {
      return Array.from(getCollectionMap(name).values()).map(cloneDoc);
    },
    collection(name) {
      const store = getCollectionMap(name);
      return {
        async createIndex() {
          return "ok";
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
          if (store.has(doc._id)) {
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

let expressServer;
let expressBaseUrl;
let vite;
let App;
let Brands;
let Products;
let Dashboard;

const TEST_URI = "mongodb://127.0.0.1:27017/productmanage";
const SESSION_FIXTURE = "qa-session-secret-0123456789abcdef";
const workerEnv = { MONGODB_URI: TEST_URI, MONGODB_DB: "productmanage" };
const nativeFetch = globalThis.fetch;
let adminCookieHeader = "";

/**
 * True for catalog writes that must carry the admin cookie.
 *
 * @param pathname Request path
 * @param method HTTP method
 * @return True when the helper should attach the session
 */
function catalogWrite(pathname, method) {
  const verb = String(method || "GET").toUpperCase();
  if (verb !== "POST" && verb !== "PUT" && verb !== "DELETE") {
    return false;
  }
  return /^\/api\/(products|brands|categories)(?:\/|$)/.test(pathname);
}

/**
 * Copy headers and attach the admin cookie unless the call opts out.
 *
 * @param pathname Request path
 * @param method HTTP method
 * @param headers Existing headers
 * @return Headers for the outgoing call
 */
function withAdminCookie(pathname, method, headers) {
  const next = new Headers(headers || {});
  const anonymous = next.get("x-test-anonymous") === "1";
  next.delete("x-test-anonymous");
  if (adminCookieHeader && !anonymous && catalogWrite(pathname, method) && !next.has("cookie")) {
    next.set("cookie", adminCookieHeader);
  }
  return next;
}

/**
 * Send a request to the Cloudflare Worker and return the Response.
 *
 * @param pathname URL path
 * @param init Fetch init
 * @param envOverride Optional Worker env override
 * @return Worker Response
 */
function callWorker(pathname, init = {}, envOverride = workerEnv) {
  const headers = withAdminCookie(pathname, init.method, init.headers);
  return worker.fetch(new Request(`http://worker.local${pathname}`, { ...init, headers }), envOverride);
}

/**
 * Create the known admin when missing and store the session cookie.
 *
 * @return Cookie request header
 */
async function loginAdmin() {
  const env = {
    MONGODB_URI: TEST_URI,
    MONGODB_DB: "productmanage",
    SESSION_SECRET: SESSION_FIXTURE,
  };
  const existing = memoryDb.dump("userinfo").find((doc) => doc.username === "ada");
  if (!existing) {
    await createUserinfo(env, {
      username: "ada",
      email: "ada@example.com",
      password: "password123",
    });
  }
  const response = await nativeFetch(`${expressBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "ada", password: "password123" }),
  });
  const body = await response.json();
  assert.equal(response.status, 200, body.error || "login failed");
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  const setCookie = cookies.find((value) => value.toLowerCase().startsWith("admin_session="))
    || response.headers.get("set-cookie")
    || "";
  const match = /admin_session=([^;]+)/.exec(setCookie);
  assert.ok(match);
  adminCookieHeader = `admin_session=${match[1]}`;
  return adminCookieHeader;
}

/**
 * Minimal stateful hook harness for driving React function components (`Brands`, `Products`, `Dashboard`).
 */
function mountInteractive(Component, initialProps = {}) {
  const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const states = [];
  const effects = [];
  let hookIndex = 0;
  let currentProps = initialProps;
  let tree = null;

  const dispatcher = {
    useState(initialValue) {
      const index = hookIndex++;
      if (!(index in states)) {
        states[index] = typeof initialValue === "function" ? initialValue() : initialValue;
      }
      const setState = (next) => {
        states[index] = typeof next === "function" ? next(states[index]) : next;
      };
      return [states[index], setState];
    },
    useRef(initialValue) {
      const index = hookIndex++;
      if (!(index in states)) {
        states[index] = { current: initialValue };
      }
      return states[index];
    },
    useMemo(factory) {
      return factory();
    },
    useEffect(callback, deps) {
      const index = hookIndex++;
      const prev = effects[index];
      const changed = !prev
        || !deps
        || !prev.deps
        || deps.length !== prev.deps.length
        || deps.some((dep, i) => !Object.is(dep, prev.deps[i]));
      if (changed) {
        effects[index] = { callback, deps, pending: true, cleanup: prev?.cleanup };
      }
    },
  };

  function expand(node) {
    if (!node || typeof node !== "object") {
      return node;
    }
    if (Array.isArray(node)) {
      return node.map(expand);
    }
    if (typeof node.type === "function") {
      const result = expand(node.type(node.props || {}));
      if (node.key != null && result && typeof result === "object" && !Array.isArray(result)) {
        return { ...result, key: node.key };
      }
      return result;
    }
    if (node.props && node.props.children !== undefined) {
      return {
        ...node,
        props: {
          ...node.props,
          children: expand(node.props.children),
        },
      };
    }
    return node;
  }

  function renderOnce() {
    const previousDispatcher = internals.H;
    internals.H = dispatcher;
    hookIndex = 0;
    try {
      tree = expand(Component(currentProps));
    } finally {
      internals.H = previousDispatcher;
    }
    return tree;
  }

  async function flushEffects() {
    renderOnce();
    for (const effect of effects) {
      if (effect && effect.pending) {
        effect.pending = false;
        if (typeof effect.cleanup === "function") {
          effect.cleanup();
        }
        effect.cleanup = effect.callback();
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
    return renderOnce();
  }

  function toHtml() {
    renderOnce();
    return renderToStaticMarkup(tree);
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
    const children = node.props?.children;
    if (children !== undefined) {
      findAll(predicate, children, results);
    }
    return results;
  }

  return {
    renderOnce,
    flushEffects,
    toHtml,
    findAll,
  };
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
  const app = await createApp({ dev: false });
  expressServer = app.listen(0);
  const { port } = expressServer.address();
  expressBaseUrl = `http://127.0.0.1:${port}`;

  vite = await createViteServer({
    root: "web",
    configFile: "web/vite.config.js",
    server: { middlewareMode: true },
    appType: "custom",
    optimizeDeps: { noDiscovery: true },
  });
  ({ default: App } = await vite.ssrLoadModule("/src/App.jsx"));
  ({ default: Brands } = await vite.ssrLoadModule("/src/components/Brands.jsx"));
  ({ default: Products } = await vite.ssrLoadModule("/src/components/Products.jsx"));
  ({ default: Dashboard } = await vite.ssrLoadModule("/src/components/Dashboard.jsx"));

  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url || "";
    let pathname = url;
    try {
      pathname = new URL(url, "http://127.0.0.1").pathname;
    } catch {
      pathname = url;
    }
    const method = init.method || "GET";
    const headers = withAdminCookie(pathname, method, init.headers);
    return nativeFetch(input, { ...init, headers });
  };
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
  adminCookieHeader = "";
  process.env.MONGODB_URI = TEST_URI;
  process.env.SESSION_SECRET = SESSION_FIXTURE;
  delete process.env.AUTH_BOOTSTRAP_USERNAME;
  delete process.env.AUTH_BOOTSTRAP_EMAIL;
  delete process.env.AUTH_BOOTSTRAP_PASSWORD;
  workerEnv.SESSION_SECRET = SESSION_FIXTURE;
  delete workerEnv.AUTH_BOOTSTRAP_USERNAME;
  delete workerEnv.AUTH_BOOTSTRAP_EMAIL;
  delete workerEnv.AUTH_BOOTSTRAP_PASSWORD;
});

test("brand-management API parity: empty name 400, duplicate rename 409, missing update/delete 404, productCount on update, and brand seeding on existing catalog", async () => {
  // 1. Pre-populate categories and products with an empty brands collection
  await memoryDb.collection("categories").insertOne({
    _id: "cat-existing",
    name: "Existing Cat",
    description: "",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  await memoryDb.collection("products").insertOne({
    _id: "prod-existing",
    name: "Existing Product",
    sku: "EX-1",
    price: 99,
    brandId: "brand-samsung",
    categoryId: "cat-existing",
    description: "",
    imageUrl: "",
    quantity: 2,
    published: true,
    inStock: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  });

  // Trigger GET /api/brands when categories and products already exist
  const seedRes = await callWorker("/api/brands");
  assert.equal(seedRes.status, 200);
  const seedBody = await seedRes.json();
  assert.equal(seedBody.items.length, 10);
  assert.equal(seedBody.items[0].id, "brand-samsung");
  assert.equal(seedBody.items[0].productCount, 1);

  // Verify starter products were NOT inserted onto the existing catalog
  const prodRes = await fetch(`${expressBaseUrl}/api/products`);
  const prodBody = await prodRes.json();
  assert.equal(prodBody.items.length, 1);
  assert.equal(prodBody.items[0].id, "prod-existing");
  assert.equal(prodBody.items[0].brandName, "Samsung");
  await loginAdmin();

  // 2. Reject missing/whitespace brand name on POST (Express & Worker)
  for (const name of ["", "   "]) {
    const expPost400 = await fetch(`${expressBaseUrl}/api/brands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: "desc" }),
    });
    assert.equal(expPost400.status, 400);
    assert.deepEqual(await expPost400.json(), { error: "Name is required" });

    const wrkPost400 = await callWorker("/api/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: "desc" }),
    });
    assert.equal(wrkPost400.status, 400);
    assert.deepEqual(await wrkPost400.json(), { error: "Name is required" });
  }

  // 3. Reject missing/whitespace brand name on PUT (Express & Worker)
  const expPut400 = await fetch(`${expressBaseUrl}/api/brands/brand-samsung`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "  ", description: "desc" }),
  });
  assert.equal(expPut400.status, 400);
  assert.deepEqual(await expPut400.json(), { error: "Name is required" });

  const wrkPut400 = await callWorker("/api/brands/brand-samsung", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "", description: "desc" }),
  });
  assert.equal(wrkPut400.status, 400);
  assert.deepEqual(await wrkPut400.json(), { error: "Name is required" });

  // 4. Update non-existent brand -> 404 (Express & Worker)
  const expPut404 = await fetch(`${expressBaseUrl}/api/brands/does-not-exist`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Valid", description: "" }),
  });
  assert.equal(expPut404.status, 404);
  assert.deepEqual(await expPut404.json(), { error: "Brand not found" });

  const wrkPut404 = await callWorker("/api/brands/does-not-exist", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Valid", description: "" }),
  });
  assert.equal(wrkPut404.status, 404);
  assert.deepEqual(await wrkPut404.json(), { error: "Brand not found" });

  // 5. Reject rename to another existing brand name ignoring case -> 409 (Express & Worker)
  const expPut409 = await fetch(`${expressBaseUrl}/api/brands/brand-sony`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: " sAmSuNg ", description: "conflict" }),
  });
  assert.equal(expPut409.status, 409);
  assert.deepEqual(await expPut409.json(), { error: "A brand with that name already exists" });

  const wrkPut409 = await callWorker("/api/brands/brand-sony", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "SAMSUNG", description: "conflict" }),
  });
  assert.equal(wrkPut409.status, 409);
  assert.deepEqual(await wrkPut409.json(), { error: "A brand with that name already exists" });

  // 6. Update existing brand with assigned product -> 200 with productCount: 1 and updatedAt
  const wrkPut200 = await callWorker("/api/brands/brand-samsung", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Samsung Electronics", description: "Updated description" }),
  });
  assert.equal(wrkPut200.status, 200);
  const { item: updatedSamsung } = await wrkPut200.json();
  assert.equal(updatedSamsung.id, "brand-samsung");
  assert.equal(updatedSamsung.name, "Samsung Electronics");
  assert.equal(updatedSamsung.description, "Updated description");
  assert.equal(updatedSamsung.productCount, 1);
  assert.ok(updatedSamsung.updatedAt);

  // 7. Delete non-existent brand on Express -> 404
  const expDel404 = await fetch(`${expressBaseUrl}/api/brands/no-such-brand`, {
    method: "DELETE",
  });
  assert.equal(expDel404.status, 404);
  assert.deepEqual(await expDel404.json(), { error: "Brand not found" });

  // 8. Block deletion of brand with assigned products on Worker -> 409
  const wrkDel409 = await callWorker("/api/brands/brand-samsung", {
    method: "DELETE",
  });
  assert.equal(wrkDel409.status, 409);
  assert.deepEqual(await wrkDel409.json(), { error: "Move or delete products in this brand first" });
});

test("Brands administrative UI (/brands): navigation order, page title and header, Add/Edit/Delete workflows, confirmation gate, and conflict error display", async () => {
  const origFetch = globalThis.fetch;
  const origConfirm = globalThis.window?.confirm;
  const confirmCalls = [];
  let confirmResult = true;
  globalThis.window = globalThis.window || {};
  globalThis.window.confirm = (msg) => {
    confirmCalls.push(msg);
    return confirmResult;
  };
  globalThis.fetch = (input, init) => {
    const url = typeof input === "string" && input.startsWith("/")
      ? `${expressBaseUrl}${input}`
      : input;
    return origFetch(url, init);
  };

  try {
    await loginAdmin();
    // 1. Check nav order, page width, and title/header in App at /brands
    const appHtml = renderToStaticMarkup(
      React.createElement(MemoryRouter, { initialEntries: ["/brands"] }, React.createElement(App)),
    );
    assert.ok(appHtml.includes('<main class="page page-wide page-admin">'));
    assert.ok(appHtml.includes("<h1>Brands</h1>"));

    const navMatches = [...appHtml.matchAll(/<a [^>]*class="nav-link(?: active)?"[^>]*>([^<]+)<\/a>/g)];
    assert.deepEqual(navMatches.map((m) => m[1]), ["Dashboard"]);

    // 2. Mount Brands component interactively
    const view = mountInteractive(Brands);
    await view.flushEffects();

    let html = view.toHtml();
    assert.ok(html.includes("<th class=\"col-no\">No</th>"));
    assert.ok(html.includes("<th class=\"col-name\">Name</th>"));
    assert.ok(html.includes("<th>Description</th>"));
    assert.ok(html.includes("<th class=\"col-count\">Products</th>"));
    assert.ok(html.includes("<th class=\"col-action\">Action</th>"));
    assert.ok(html.includes("Samsung"));
    assert.ok(html.includes("Casper"));

    // 3. Add a new brand via the inline form
    const addBtn = view.findAll((n) => n.type === "button" && n.props?.children === "Add")[0];
    addBtn.props.onClick();
    view.renderOnce();

    // Blank name client validation
    let formEl = view.findAll((n) => n.type === "form")[0];
    await formEl.props.onSubmit({ preventDefault() {} });
    html = view.toHtml();
    assert.ok(html.includes('<p class="message error">Name is required</p>'));

    // Valid brand creation
    const nameInput = view.findAll((n) => n.type === "input")[0];
    const descInput = view.findAll((n) => n.type === "textarea")[0];
    nameInput.props.onChange({ target: { value: "  Bosch  " } });
    descInput.props.onChange({ target: { value: "  German appliances  " } });
    view.renderOnce();

    formEl = view.findAll((n) => n.type === "form")[0];
    await formEl.props.onSubmit({ preventDefault() {} });
    html = view.toHtml();
    assert.ok(html.includes("Bosch"));
    assert.ok(html.includes("German appliances"));

    // 4. Edit the newly created brand (first row)
    const editButtons = view.findAll((n) => n.type === "button" && n.props?.["aria-label"] === "Edit");
    editButtons[0].props.onClick();
    view.renderOnce();

    const editNameInput = view.findAll((n) => n.type === "input")[0];
    assert.equal(editNameInput.props.value, "Bosch");
    editNameInput.props.onChange({ target: { value: "Bosch Home" } });
    view.renderOnce();

    formEl = view.findAll((n) => n.type === "form")[0];
    await formEl.props.onSubmit({ preventDefault() {} });
    html = view.toHtml();
    assert.ok(html.includes("Bosch Home"));

    // 5. Delete confirmation cancelled -> does NOT delete row
    confirmResult = false;
    let deleteButtons = view.findAll((n) => n.type === "button" && n.props?.["aria-label"] === "Delete");
    await deleteButtons[0].props.onClick();
    assert.equal(confirmCalls.at(-1), "Delete Bosch Home?");
    html = view.toHtml();
    assert.ok(html.includes("Bosch Home"));

    // 6. Delete confirmation accepted on empty brand -> deletes row
    confirmResult = true;
    deleteButtons = view.findAll((n) => n.type === "button" && n.props?.["aria-label"] === "Delete");
    await deleteButtons[0].props.onClick();
    html = view.toHtml();
    assert.ok(!html.includes("Bosch Home"));

    // 7. Delete confirmation accepted on Samsung (which has 1 product) -> shows 409 error in .message.error and retains Samsung
    deleteButtons = view.findAll((n) => n.type === "button" && n.props?.["aria-label"] === "Delete");
    await deleteButtons[0].props.onClick();
    assert.equal(confirmCalls.at(-1), "Delete Samsung?");
    html = view.toHtml();
    assert.ok(html.includes('<p class="message error">Move or delete products in this brand first</p>'));
    assert.ok(html.includes("Samsung"));
  } finally {
    globalThis.fetch = origFetch;
    if (origConfirm !== undefined) {
      globalThis.window.confirm = origConfirm;
    }
  }
});

test("product-management brand validation on PUT, Brand column order, Brand selector on Add/Edit, and legacy row toggle behavior", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = typeof input === "string" && input.startsWith("/")
      ? `${expressBaseUrl}${input}`
      : input;
    return origFetch(url, init);
  };

  try {
    await loginAdmin();
    // Seed catalog
    await origFetch(`${expressBaseUrl}/api/products`);

    // 1. PUT /api/products/:id rejects blank or unknown brandId on both Express and Worker
    for (const [brandId, expectedError] of [
      ["   ", "Brand is required"],
      ["brand-unknown", "Brand not found"],
    ]) {
      const payload = JSON.stringify({
        name: "Wireless Mouse",
        sku: "EL-100",
        price: 24.5,
        brandId,
        categoryId: "cat-electronics",
        description: "Compact Bluetooth mouse",
        quantity: 10,
      });
      const expRes = await origFetch(`${expressBaseUrl}/api/products/prod-mouse`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      assert.equal(expRes.status, 400);
      assert.deepEqual(await expRes.json(), { error: expectedError });

      const wrkRes = await callWorker("/api/products/prod-mouse", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      assert.equal(wrkRes.status, 400);
      assert.deepEqual(await wrkRes.json(), { error: expectedError });
    }

    // 2. Insert a legacy product without brandId directly into memoryDb to verify read & legacy toggle behavior
    await memoryDb.collection("products").insertOne({
      _id: "prod-legacy",
      name: "Legacy Toaster",
      sku: "LG-01",
      price: 30,
      categoryId: "cat-home",
      description: "No brandId stored",
      imageUrl: "",
      quantity: 3,
      published: true,
      inStock: true,
      createdAt: "2099-01-01T00:00:00.000Z",
    });

    // Mount Products page
    const view = mountInteractive(Products);
    await view.flushEffects();

    let html = view.toHtml();
    // Verify exact table header order: No, Name, SKU, Brand, Category, Price, Image, Quantity, Description, Status, Stock, Action
    const headers = [...html.matchAll(/<th[^>]*>([^<]+)<\/th>/g)].map((m) => m[1]);
    assert.deepEqual(headers, [
      "No",
      "Name",
      "SKU",
      "Brand",
      "Category",
      "Price",
      "Image",
      "Quantity",
      "Description",
      "Status",
      "Stock",
      "Action",
    ]);
    assert.ok(html.includes("<td class=\"col-brand\">Samsung</td>"));
    assert.ok(html.includes("<td class=\"col-brand\">Sony</td>"));
    assert.ok(html.includes("<td class=\"col-brand\">Panasonic</td>"));
    assert.ok(html.includes("<td class=\"col-brand\"></td>"));

    // 3. Clicking stock toggle on legacy row without brandId fails with "Brand is required" in .message.error and leaves row unchanged
    const stockButtons = view.findAll(
      (n) => n.type === "button" && n.props?.["aria-label"] === "Mark out of stock",
    );
    await stockButtons[0].props.onClick();
    html = view.toHtml();
    assert.ok(html.includes('<p class="message error">Brand is required</p>'));
    assert.ok(!html.includes("Out of Stock"));

    // 4. Open Add form -> Brand select defaults to first brand (brand-samsung) and sits before Category
    const addBtn = view.findAll((n) => n.type === "button" && n.props?.children === "Add")[0];
    addBtn.props.onClick();
    view.renderOnce();

    let selects = view.findAll((n) => n.type === "select");
    assert.equal(selects.length, 2);
    assert.equal(selects[0].props.value, "brand-samsung");
    assert.equal(selects[1].props.value, "cat-electronics");

    // 5. Open Edit form on legacy product -> Brand select is "" (does not substitute first brand)
    let editButtons = view.findAll((n) => n.type === "button" && n.props?.["aria-label"] === "Edit");
    editButtons[0].props.onClick();
    view.renderOnce();

    selects = view.findAll((n) => n.type === "select");
    assert.equal(selects[0].props.value, "");

    // Submitting legacy edit without picking a brand shows client-side "Brand is required"
    let formEl = view.findAll((n) => n.type === "form")[0];
    await formEl.props.onSubmit({ preventDefault() {} });
    html = view.toHtml();
    assert.ok(html.includes('<p class="message error">Brand is required</p>'));

    // 6. Scenario: Edit a product to change its brand (change Wireless Mouse from Samsung to LG)
    editButtons = view.findAll((n) => n.type === "button" && n.props?.["aria-label"] === "Edit");
    // Index 1 is Wireless Mouse (since Legacy Toaster is newest at index 0)
    editButtons[1].props.onClick();
    view.renderOnce();

    selects = view.findAll((n) => n.type === "select");
    assert.equal(selects[0].props.value, "brand-samsung");
    selects[0].props.onChange({ target: { value: "brand-lg" } });
    view.renderOnce();

    formEl = view.findAll((n) => n.type === "form")[0];
    await formEl.props.onSubmit({ preventDefault() {} });
    html = view.toHtml();
    assert.ok(html.includes("<td class=\"col-brand\">LG</td>"));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("product-dashboard: GET / 302 redirect, menu order, Brands section before Categories, brand filtering in memory, collapse/expand, chip removal, and zero-match state", async () => {
  const origFetch = globalThis.fetch;
  const fetchCalls = [];
  globalThis.fetch = (input, init) => {
    const url = typeof input === "string" && input.startsWith("/")
      ? `${expressBaseUrl}${input}`
      : input;
    fetchCalls.push(String(input));
    return origFetch(url, init);
  };

  try {
    await loginAdmin();
    // 1. Root URL redirects to /dashboard with HTTP 302 on Express (when static index does not intercept) and Worker
    const distIndex = path.join("web", "dist", "index.html");
    const distBackup = path.join("web", "dist", "index.html.bak");
    const hadDistIndex = fs.existsSync(distIndex);
    if (hadDistIndex) {
      // With web/dist/index.html present, verify all four pagePaths return 200 HTML on Express
      for (const pagePath of ["/dashboard", "/products", "/brands", "/categories"]) {
        const pageRes = await origFetch(`${expressBaseUrl}${pagePath}`);
        assert.equal(pageRes.status, 200);
        assert.match(pageRes.headers.get("content-type") || "", /text\/html/);
      }
      fs.renameSync(distIndex, distBackup);
    }
    try {
      const expRoot = await origFetch(`${expressBaseUrl}/`, { redirect: "manual" });
      assert.equal(expRoot.status, 302);
      assert.equal(expRoot.headers.get("location"), "/dashboard");
    } finally {
      if (hadDistIndex && fs.existsSync(distBackup)) {
        fs.renameSync(distBackup, distIndex);
      }
    }

    const wrkRoot = await callWorker("/");
    assert.equal(wrkRoot.status, 302);
    assert.equal(new URL(wrkRoot.headers.get("location")).pathname, "/dashboard");

    // Verify Worker serves /brands via ASSETS binding
    const wrkBrandsPage = await callWorker("/brands", {
      headers: { cookie: adminCookieHeader },
    }, {
      ...workerEnv,
      ASSETS: {
        async fetch(req) {
          return new Response(`<!doctype html><title>Brands</title><!-- ${new URL(req.url).pathname} -->`, {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        },
      },
    });
    assert.equal(wrkBrandsPage.status, 200);
    assert.match(await wrkBrandsPage.text(), /\/brands/);

    // 2. Dashboard route in App renders menu Dashboard | Products | Brands | Categories and omits <h1>
    const dashAppHtml = renderToStaticMarkup(
      React.createElement(MemoryRouter, { initialEntries: ["/dashboard"] }, React.createElement(App)),
    );
    assert.ok(dashAppHtml.includes('<main class="page page-dashboard">'));
    assert.ok(!dashAppHtml.includes("<h1>"));
    const navLinks = [...dashAppHtml.matchAll(/<a [^>]*class="nav-link(?: active)?"[^>]*>([^<]+)<\/a>/g)];
    assert.deepEqual(navLinks.map((m) => m[1]), ["Dashboard"]);
    assert.match(navLinks[0][0], /nav-link active/);

    // 3. Mount Dashboard and verify parallel fetch, section order, and initial catalog
    fetchCalls.length = 0;
    const dash = mountInteractive(Dashboard);
    await dash.flushEffects();
    assert.deepEqual(fetchCalls.slice().sort(), ["/api/brands", "/api/categories", "/api/products"]);

    let html = dash.toHtml();
    assert.ok(html.includes("3 items"));
    const sectionTitles = [...html.matchAll(/<button[^>]*class="section-toggle"[^>]*><span>([^<]+)<\/span>/g)].map(
      (m) => m[1],
    );
    assert.deepEqual(sectionTitles, ["Availability", "Price", "Brands", "Categories"]);

    // Verify cards show categoryName in .card-collection and do not add brand text to cards
    // Starter products share the same createdAt, so "newest" sort tie-breaks by id ascending:
    // prod-guide (Books), prod-lamp (Home), prod-mouse (Electronics)
    const cardCollections = [...html.matchAll(/<p class="card-collection">([^<]+)<\/p>/g)].map((m) => m[1]);
    assert.deepEqual(cardCollections, ["Books", "Home", "Electronics"]);

    // 3b. Activate In Stock Only filter -> sets aria-pressed="true", adds chip, excludes out-of-stock product
    await origFetch(`${expressBaseUrl}/api/products/prod-lamp`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Desk Lamp",
        sku: "HM-220",
        price: 39,
        brandId: "brand-panasonic",
        categoryId: "cat-home",
        description: "Adjustable LED lamp",
        quantity: 5,
        published: true,
        inStock: false,
        imageUrl: "",
      }),
    });
    const dashStock = mountInteractive(Dashboard);
    await dashStock.flushEffects();
    const stockBtn = dashStock.findAll((n) => n.type === "button" && n.props?.className === "stock-toggle")[0];
    assert.equal(stockBtn.props["aria-pressed"], false);
    stockBtn.props.onClick();
    const stockHtml = dashStock.toHtml();
    assert.ok(stockHtml.includes('aria-pressed="true"'));
    assert.ok(stockHtml.includes("In Stock Only ×"));
    assert.ok(stockHtml.includes("2 items"));
    assert.ok(!stockHtml.includes("Desk Lamp"));

    // Remove In Stock Only chip
    const removeStockChip = dashStock.findAll(
      (n) => n.type === "button" && n.props?.["aria-label"] === "Remove In Stock Only",
    )[0];
    removeStockChip.props.onClick();
    assert.ok(dashStock.toHtml().includes("3 items"));

    // 4. Check Samsung and Sony in Brands filter -> OR union (2 items), chips before category chips, no refetch
    const callsBeforeFilter = fetchCalls.length;
    const allCheckboxes = dash.findAll((n) => n.type === "input" && n.props?.type === "checkbox");
    // 5 price checkboxes (0..4), 10 brand checkboxes (5..14), 3 category checkboxes (15..17)
    allCheckboxes[5].props.onChange(); // Samsung
    allCheckboxes[6].props.onChange(); // Sony
    allCheckboxes[15].props.onChange(); // Electronics category
    html = dash.toHtml();
    assert.equal(fetchCalls.length, callsBeforeFilter); // No extra fetch calls!
    assert.ok(html.includes("1 items"));
    assert.ok(html.includes("Wireless Mouse"));
    assert.ok(!html.includes("Field Guide"));

    // Verify chip order: Samsung, Sony, then Electronics
    const chipLabels = [...html.matchAll(/aria-label="Remove ([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(chipLabels, ["Samsung", "Sony", "Electronics"]);

    // Verify whole-catalog price counts remain 3 for below $100
    assert.ok(html.includes('<span class="price-count">3</span>'));

    // 5. Collapse and expand the Brands section while preserving active selection
    const brandSectionToggle = dash.findAll(
      (n) => n.type === "button" && n.props?.["aria-controls"] === "filter-brand",
    )[0];
    assert.equal(brandSectionToggle.props["aria-expanded"], true);
    brandSectionToggle.props.onClick();
    html = dash.toHtml();
    const collapsedBrandToggle = dash.findAll(
      (n) => n.type === "button" && n.props?.["aria-controls"] === "filter-brand",
    )[0];
    assert.equal(collapsedBrandToggle.props["aria-expanded"], false);
    assert.ok(html.includes('id="filter-brand" class="filter-body" hidden=""'));
    assert.ok(html.includes("1 items")); // Selection preserved!

    // Expand Brands section back
    collapsedBrandToggle.props.onClick();
    html = dash.toHtml();
    assert.ok(!html.includes('id="filter-brand" class="filter-body" hidden=""'));

    // 6. Remove Electronics category chip via chip click -> leaves Samsung + Sony (2 items)
    const removeCategoryChip = dash.findAll(
      (n) => n.type === "button" && n.props?.["aria-label"] === "Remove Electronics",
    )[0];
    removeCategoryChip.props.onClick();
    html = dash.toHtml();
    assert.ok(html.includes("2 items"));
    assert.ok(html.includes("Wireless Mouse"));
    assert.ok(html.includes("Field Guide"));

    // Remove Samsung brand chip -> leaves only Sony (1 item: Field Guide)
    const removeSamsungChip = dash.findAll(
      (n) => n.type === "button" && n.props?.["aria-label"] === "Remove Samsung",
    )[0];
    removeSamsungChip.props.onClick();
    html = dash.toHtml();
    assert.ok(html.includes("1 items"));
    assert.ok(!html.includes("Wireless Mouse"));
    assert.ok(html.includes("Field Guide"));

    // 7. Select LG (which has 0 products) and remove Sony -> zero-match filter state
    const removeSonyChip = dash.findAll(
      (n) => n.type === "button" && n.props?.["aria-label"] === "Remove Sony",
    )[0];
    removeSonyChip.props.onClick();
    const checkboxesAfter = dash.findAll((n) => n.type === "input" && n.props?.type === "checkbox");
    checkboxesAfter[7].props.onChange(); // LG
    html = dash.toHtml();
    assert.ok(html.includes("0 items"));
    assert.ok(html.includes("No products match the selected filters."));
    assert.ok(html.includes('<span class="price-count">3</span>'));
    assert.equal(fetchCalls.length, callsBeforeFilter);

    // 8. When /api/brands returns empty list -> Brands filter section shows "No brands yet.", /brands shows "No brands yet.", /products shows "No brands"
    globalThis.fetch = async (input, init) => {
      if (String(input).endsWith("/api/brands")) {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      const url = typeof input === "string" && input.startsWith("/")
        ? `${expressBaseUrl}${input}`
        : input;
      return origFetch(url, init);
    };
    const dashNoBrands = mountInteractive(Dashboard);
    await dashNoBrands.flushEffects();
    assert.ok(dashNoBrands.toHtml().includes('<p class="message">No brands yet.</p>'));

    const brandsPageEmpty = mountInteractive(Brands);
    await brandsPageEmpty.flushEffects();
    assert.ok(brandsPageEmpty.toHtml().includes('<td class="empty" colSpan="5">No brands yet.</td>'));

    const productsNoBrands = mountInteractive(Products);
    await productsNoBrands.flushEffects();
    const addBtnEmpty = productsNoBrands.findAll((n) => n.type === "button" && n.props?.children === "Add")[0];
    addBtnEmpty.props.onClick();
    assert.ok(productsNoBrands.toHtml().includes(">No brands</option>"));

    // 9. When GET /api/brands returns HTTP 500 -> Dashboard renders error in <p class="message error">
    globalThis.fetch = async (input, init) => {
      if (String(input).endsWith("/api/brands")) {
        return new Response(JSON.stringify({ error: "Could not load brands" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      const url = typeof input === "string" && input.startsWith("/")
        ? `${expressBaseUrl}${input}`
        : input;
      return origFetch(url, init);
    };
    const dashBrandError = mountInteractive(Dashboard);
    await dashBrandError.flushEffects();
    assert.ok(dashBrandError.toHtml().includes('<p class="message error">Could not load brands</p>'));
  } finally {
    globalThis.fetch = origFetch;
  }
});
