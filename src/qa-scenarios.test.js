import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { MongoClient } from "mongodb";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer as createViteServer } from "vite";
import { createApp } from "./app.js";
import { signSession } from "./session.js";
import { authenticate, createUserinfo, listCategories } from "./store.js";
import worker from "./worker.js";

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff]);
const WEBP_BYTES = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const GIF_BYTES = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

/**
 * Encode bytes as base64.
 *
 * @param bytes Byte array
 * @return Base64 string
 */
function toBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

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
let Products;
let Dashboard;
let ProductPanel;
let ProductImage;
let viewCatalog;
let createFilterState;

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
 * Read the admin Set-Cookie header, or an empty string when it was not set.
 *
 * @param response Fetch or Worker response
 * @return Set-Cookie value
 */
function sessionCookieValue(response) {
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  return cookies.find((value) => value.toLowerCase().startsWith("admin_session="))
    || response.headers.get("set-cookie")
    || "";
}

/**
 * Compare a redirect Location as a path.
 *
 * @param response Fetch or Worker response
 * @return Pathname
 */
function locationPath(response) {
  const location = response.headers.get("location") || "";
  if (location.startsWith("/")) {
    return location;
  }
  return new URL(location).pathname;
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
  const match = /admin_session=([^;]+)/.exec(sessionCookieValue(response));
  assert.ok(match);
  adminCookieHeader = `admin_session=${match[1]}`;
  return adminCookieHeader;
}

/**
 * Minimal stateful hook harness for driving React function components (`Products`, `Dashboard`, `ProductImage`).
 *
 * @param Component Function component
 * @param initialProps Initial props
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
    setProps(nextProps) {
      currentProps = nextProps;
      return renderOnce();
    },
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
  ({ default: Products } = await vite.ssrLoadModule("/src/components/Products.jsx"));
  ({ default: Dashboard } = await vite.ssrLoadModule("/src/components/Dashboard.jsx"));
  ({ default: ProductPanel } = await vite.ssrLoadModule("/src/components/ProductPanel.jsx"));
  ({ default: ProductImage } = await vite.ssrLoadModule("/src/components/ProductImage.jsx"));
  ({ viewCatalog, createFilterState } = await vite.ssrLoadModule("/src/catalogView.js"));

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

beforeEach(async () => {
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
  await loginAdmin();
});

test("Scenario: Seed starter products on first request & Fetch products from catalog (Express & Worker parity)", async () => {
  const expressRes = await fetch(`${expressBaseUrl}/api/products`);
  assert.equal(expressRes.status, 200);
  const expressBody = await expressRes.json();
  assert.equal(expressBody.items.length, 3);
  assert.deepEqual(
    expressBody.items.map((item) => item.name),
    ["Wireless Mouse", "Field Guide", "Desk Lamp"],
  );
  for (const item of expressBody.items) {
    assert.equal(item.published, true);
    assert.equal(item.imageUrl, "");
    assert.equal(typeof item.categoryName, "string");
    assert.ok(item.categoryName.length > 0);
    assert.equal(Number.isInteger(item.quantity), true);
  }
  const byId = Object.fromEntries(expressBody.items.map((item) => [item.id, item]));
  assert.equal(byId["prod-mouse"].brandId, "brand-samsung");
  assert.equal(byId["prod-mouse"].brandName, "Samsung");
  assert.equal(byId["prod-guide"].brandId, "brand-sony");
  assert.equal(byId["prod-guide"].brandName, "Sony");
  assert.equal(byId["prod-lamp"].brandId, "brand-panasonic");
  assert.equal(byId["prod-lamp"].brandName, "Panasonic");

  // Add a newer product and verify createdAt descending order on Worker
  const createRes = await callWorker("/api/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Newer Item",
      sku: "NW-1",
      price: 15,
      brandId: "brand-sony",
      categoryId: "cat-books",
      description: "Newest item",
      quantity: 3,
      published: false,
    }),
  });
  assert.equal(createRes.status, 201);

  const workerListRes = await callWorker("/api/products");
  assert.equal(workerListRes.status, 200);
  const workerListBody = await workerListRes.json();
  assert.equal(workerListBody.items[0].name, "Newer Item");
  assert.equal(workerListBody.items[0].categoryName, "Books");
  assert.equal(workerListBody.items[0].published, false);
});

test("Scenario: Set product image by uploading a valid file (Express, Worker, and /products UI)", async () => {
  // Seed catalog first
  await fetch(`${expressBaseUrl}/api/products`);

  // Upload via Express POST /api/products
  const createRes = await fetch(`${expressBaseUrl}/api/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Uploaded Camera",
      sku: "CAM-01",
      price: 199.95,
      brandId: "brand-samsung",
      categoryId: "cat-electronics",
      description: "Digital camera",
      quantity: 4,
      published: true,
      imageUrl: "",
      imageFile: {
        contentType: "image/png",
        dataBase64: toBase64(PNG_BYTES),
      },
    }),
  });
  assert.equal(createRes.status, 201);
  const { item } = await createRes.json();
  assert.equal(item.imageUrl, `/api/products/${encodeURIComponent(item.id)}/image`);

  // Verify GET /api/products/:id/image on Express
  const imgExpress = await fetch(`${expressBaseUrl}${item.imageUrl}`);
  assert.equal(imgExpress.status, 200);
  assert.equal(imgExpress.headers.get("content-type"), "image/png");
  assert.equal(imgExpress.headers.get("x-content-type-options"), "nosniff");
  assert.equal(imgExpress.headers.get("cache-control"), "no-store");
  assert.deepEqual(new Uint8Array(await imgExpress.arrayBuffer()), PNG_BYTES);

  // Verify GET /api/products/:id/image on Worker
  const imgWorker = await callWorker(item.imageUrl);
  assert.equal(imgWorker.status, 200);
  assert.equal(imgWorker.headers.get("content-type"), "image/png");
  assert.equal(imgWorker.headers.get("x-content-type-options"), "nosniff");
  assert.equal(imgWorker.headers.get("cache-control"), "no-store");
  assert.deepEqual(new Uint8Array(await imgWorker.arrayBuffer()), PNG_BYTES);
});

test("Scenario: Set product image by entering an http or https URL (Express & Worker)", async () => {
  await fetch(`${expressBaseUrl}/api/products`);

  const workerRes = await callWorker("/api/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "URL Lamp",
      sku: "LP-02",
      price: 45,
      brandId: "brand-panasonic",
      categoryId: "cat-home",
      description: "Lamp with URL image",
      quantity: 2,
      imageUrl: "  https://example.com/lamp.jpg  ",
    }),
  });
  assert.equal(workerRes.status, 201);
  const { item } = await workerRes.json();
  assert.equal(item.imageUrl, "https://example.com/lamp.jpg");
  assert.equal(item.published, true);

  // No image document should exist in productImages for external URL
  const imgRes = await callWorker(`/api/products/${item.id}/image`);
  assert.equal(imgRes.status, 404);
  assert.deepEqual(await imgRes.json(), { error: "Product image not found" });
});

test("Scenario: Switch product image between uploaded file and URL on edit (Express & Worker)", async () => {
  await fetch(`${expressBaseUrl}/api/products`);

  // 1. Create with uploaded PNG
  const createRes = await fetch(`${expressBaseUrl}/api/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Switchable Item",
      sku: "SW-1",
      price: 29,
      brandId: "brand-samsung",
      categoryId: "cat-electronics",
      description: "Switch test",
      quantity: 5,
      imageFile: { contentType: "image/png", dataBase64: toBase64(PNG_BYTES) },
    }),
  });
  const { item: created } = await createRes.json();
  const uploadPath = `/api/products/${created.id}/image`;
  assert.equal(created.imageUrl, uploadPath);

  // 2. Replace uploaded image with external URL via PUT
  const toUrlRes = await callWorker(`/api/products/${created.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Switchable Item",
      sku: "SW-1",
      price: 29,
      brandId: "brand-samsung",
      categoryId: "cat-electronics",
      description: "Switch test",
      quantity: 5,
      imageUrl: "https://example.com/switched.png",
    }),
  });
  assert.equal(toUrlRes.status, 200);
  const { item: afterUrl } = await toUrlRes.json();
  assert.equal(afterUrl.imageUrl, "https://example.com/switched.png");
  assert.ok(afterUrl.updatedAt);

  // Previous uploaded blob should be deleted
  const deletedBlobRes = await fetch(`${expressBaseUrl}${uploadPath}`);
  assert.equal(deletedBlobRes.status, 404);

  // 3. Replace external URL with uploaded JPEG via PUT
  const toFileRes = await fetch(`${expressBaseUrl}/api/products/${created.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Switchable Item",
      sku: "SW-1",
      price: 29,
      brandId: "brand-samsung",
      categoryId: "cat-electronics",
      description: "Switch test",
      quantity: 5,
      imageUrl: "",
      imageFile: { contentType: "image/jpeg", dataBase64: toBase64(JPEG_BYTES) },
    }),
  });
  assert.equal(toFileRes.status, 200);
  const { item: afterFile } = await toFileRes.json();
  assert.equal(afterFile.imageUrl, uploadPath);
  assert.ok(afterFile.updatedAt);

  const newBlobRes = await callWorker(uploadPath);
  assert.equal(newBlobRes.status, 200);
  assert.equal(newBlobRes.headers.get("content-type"), "image/jpeg");
  assert.deepEqual(new Uint8Array(await newBlobRes.arrayBuffer()), JPEG_BYTES);
});

test("Scenario: Reject invalid uploaded image file or invalid image URL & Reject product with missing name, invalid category, bad price, or bad quantity", async () => {
  await fetch(`${expressBaseUrl}/api/products`);

  const invalidPayloads = [
    [
      { name: "   ", categoryId: "cat-books", price: 10, quantity: 1 },
      "Name is required",
    ],
    [
      { name: "Valid", brandId: "", categoryId: "cat-books", price: 10, quantity: 1 },
      "Brand is required",
    ],
    [
      { name: "Valid", brandId: "brand-missing", categoryId: "cat-books", price: 10, quantity: 1 },
      "Brand not found",
    ],
    [
      { name: "Valid", brandId: "brand-samsung", categoryId: "", price: 10, quantity: 1 },
      "Category is required",
    ],
    [
      { name: "Valid", brandId: "brand-samsung", categoryId: "cat-missing", price: 10, quantity: 1 },
      "Category not found",
    ],
    [
      { name: "Valid", brandId: "brand-samsung", categoryId: "cat-books", price: -1, quantity: 1 },
      "Price must be a number that is zero or greater",
    ],
    [
      { name: "Valid", brandId: "brand-samsung", categoryId: "cat-books", price: "abc", quantity: 1 },
      "Price must be a number that is zero or greater",
    ],
    [
      { name: "Valid", brandId: "brand-samsung", categoryId: "cat-books", price: 10, quantity: -1 },
      "Quantity must be a whole number that is zero or greater",
    ],
    [
      { name: "Valid", brandId: "brand-samsung", categoryId: "cat-books", price: 10, quantity: 1.5 },
      "Quantity must be a whole number that is zero or greater",
    ],
    [
      { name: "Valid", brandId: "brand-samsung", categoryId: "cat-books", price: 10, quantity: 1, imageUrl: "ftp://bad.example/a.png" },
      "Image must be an http or https URL",
    ],
    [
      {
        name: "Valid",
        brandId: "brand-samsung",
        categoryId: "cat-books",
        price: 10,
        quantity: 1,
        imageUrl: `https://example.com/${"a".repeat(2040)}`,
      },
      "Image URL is too long",
    ],
    [
      {
        name: "Valid",
        brandId: "brand-samsung",
        categoryId: "cat-books",
        price: 10,
        quantity: 1,
        imageFile: { contentType: "image/svg+xml", dataBase64: toBase64(Buffer.from("<svg></svg>")) },
      },
      "Image file must be PNG, JPEG, WebP, or GIF",
    ],
    [
      {
        name: "Valid",
        brandId: "brand-samsung",
        categoryId: "cat-books",
        price: 10,
        quantity: 1,
        imageFile: { contentType: "image/png", dataBase64: "A".repeat(1398108) },
      },
      "Image file must be 1 MB or smaller",
    ],
    [
      {
        name: "Valid",
        brandId: "brand-samsung",
        categoryId: "cat-books",
        price: 10,
        quantity: 1,
        imageUrl: "https://example.com/a.png",
        imageFile: { contentType: "image/png", dataBase64: toBase64(PNG_BYTES) },
      },
      "Choose an image file or an image URL, not both",
    ],
    [
      {
        name: "Valid",
        brandId: "brand-samsung",
        categoryId: "cat-books",
        price: 10,
        quantity: 1,
        published: "false",
      },
      "Published must be true or false",
    ],
  ];

  for (const [payload, expectedMessage] of invalidPayloads) {
    const expressRes = await fetch(`${expressBaseUrl}/api/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert.equal(expressRes.status, 400);
    assert.deepEqual(await expressRes.json(), { error: expectedMessage });

    const workerRes = await callWorker("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert.equal(workerRes.status, 400);
    assert.deepEqual(await workerRes.json(), { error: expectedMessage });
  }

  // Ensure product count is still only the 3 starter products
  const listRes = await callWorker("/api/products");
  const { items } = await listRes.json();
  assert.equal(items.length, 3);
});

test("Scenario: Publish and unpublish a product & Attempt to change publish state of a non-existent product & Update non-existent product", async () => {
  await fetch(`${expressBaseUrl}/api/products`);

  // Unpublish prod-mouse on Express
  const unpubRes = await fetch(`${expressBaseUrl}/api/products/prod-mouse`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Wireless Mouse",
      sku: "EL-100",
      price: 24.5,
      brandId: "brand-samsung",
      categoryId: "cat-electronics",
      description: "Compact Bluetooth mouse",
      quantity: 10,
      published: false,
      imageUrl: "",
    }),
  });
  assert.equal(unpubRes.status, 200);
  const { item: unpublishedItem } = await unpubRes.json();
  assert.equal(unpublishedItem.published, false);
  assert.ok(unpublishedItem.updatedAt);

  // Omitted published on update keeps false
  const keepDraftRes = await callWorker("/api/products/prod-mouse", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Wireless Mouse v2",
      sku: "EL-100",
      price: 25,
      brandId: "brand-samsung",
      categoryId: "cat-electronics",
      description: "Compact Bluetooth mouse",
      quantity: 10,
      imageUrl: "",
    }),
  });
  assert.equal(keepDraftRes.status, 200);
  assert.equal((await keepDraftRes.json()).item.published, false);

  // Publish prod-mouse again on Worker
  const pubRes = await callWorker("/api/products/prod-mouse", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Wireless Mouse v2",
      sku: "EL-100",
      price: 25,
      brandId: "brand-samsung",
      categoryId: "cat-electronics",
      description: "Compact Bluetooth mouse",
      quantity: 10,
      published: true,
      imageUrl: "",
    }),
  });
  assert.equal(pubRes.status, 200);
  assert.equal((await pubRes.json()).item.published, true);

  // Non-existent product returns 404 on both Express and Worker
  const missingBody = JSON.stringify({
    name: "Ghost",
    sku: "GH-1",
    price: 10,
    categoryId: "cat-books",
    description: "",
    quantity: 1,
    published: false,
    imageUrl: "",
  });
  const exp404 = await fetch(`${expressBaseUrl}/api/products/does-not-exist`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: missingBody,
  });
  assert.equal(exp404.status, 404);
  assert.deepEqual(await exp404.json(), { error: "Product not found" });

  const wrk404 = await callWorker("/api/products/does-not-exist", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: missingBody,
  });
  assert.equal(wrk404.status, 404);
  assert.deepEqual(await wrk404.json(), { error: "Product not found" });
});

test("Scenario: View and manage products on admin page (/products UI end-to-end with Express API)", async () => {
  const origFetch = globalThis.fetch;
  const origConfirm = globalThis.window?.confirm;
  globalThis.window = globalThis.window || {};
  globalThis.window.confirm = () => true;
  globalThis.fetch = (input, init) => {
    const url = typeof input === "string" && input.startsWith("/")
      ? `${expressBaseUrl}${input}`
      : input;
    return origFetch(url, init);
  };

  try {
    const view = mountInteractive(Products);
    await view.flushEffects();

    let html = view.toHtml();
    assert.ok(html.includes("Wireless Mouse"));
    assert.ok(html.includes("24.50"));
    assert.ok(html.includes("<th class=\"col-status\">Status</th>"));
    assert.ok(html.includes("<td class=\"col-status\">Published</td>"));

    // Click Add button
    const addButton = view.findAll((n) => n.type === "button" && n.props?.children === "Add")[0];
    assert.ok(addButton);
    addButton.props.onClick();
    view.renderOnce();

    // Fill form inputs and upload a valid WebP file
    const inputs = view.findAll((n) => n.type === "input");
    const nameInput = inputs[0];
    const priceInput = inputs[2];
    const fileInput = inputs.find((n) => n.props?.type === "file");
    const quantityInput = inputs.find((n) => n.props?.type === "number" && n.props?.step === "1");

    nameInput.props.onChange({ target: { value: "Admin Uploaded Product" } });
    priceInput.props.onChange({ target: { value: "55.5" } });
    quantityInput.props.onChange({ target: { value: "2" } });

    const fakeFile = {
      type: "image/webp",
      size: WEBP_BYTES.byteLength,
      async arrayBuffer() {
        return WEBP_BYTES.buffer.slice(
          WEBP_BYTES.byteOffset,
          WEBP_BYTES.byteOffset + WEBP_BYTES.byteLength,
        );
      },
    };
    fileInput.props.onChange({ target: { files: [fakeFile] } });
    view.renderOnce();

    const formEl = view.findAll((n) => n.type === "form")[0];
    await formEl.props.onSubmit({ preventDefault() {} });

    html = view.toHtml();
    assert.ok(html.includes("Admin Uploaded Product"));
    assert.ok(html.includes("55.50"));
    assert.match(html, /src="\/api\/products\/[^/]+\/image\?v=[^"]+"/);

    html = view.toHtml();
    assert.ok(!html.includes("Cart"));
    assert.ok(!html.includes("Add to Cart"));
    assert.ok(html.includes("<th class=\"col-stock\">Stock</th>"));
    assert.ok(html.includes("In Stock"));

    const outOfStockBtn = view.findAll((n) => n.type === "button" && n.props?.["aria-label"] === "Mark out of stock")[0];
    await outOfStockBtn.props.onClick();
    html = view.toHtml();
    assert.ok(html.includes("Out of Stock"));
    const inStockBtn = view.findAll((n) => n.type === "button" && n.props?.["aria-label"] === "Mark in stock")[0];
    await inStockBtn.props.onClick();
    html = view.toHtml();
    assert.ok(!html.includes("Out of Stock"));
    assert.ok(html.includes("aria-label=\"Unpublish\""));
    assert.ok(html.includes("aria-label=\"Edit\""));
    assert.ok(html.includes("aria-label=\"Delete\""));

    // Toggle Unpublish on the first row ("Admin Uploaded Product")
    const unpublishBtn = view.findAll((n) => n.type === "button" && n.props?.["aria-label"] === "Unpublish")[0];
    await unpublishBtn.props.onClick();
    html = view.toHtml();
    assert.ok(html.includes("<td class=\"col-status\">Unpublished</td>"));

    // Toggle Publish back on the first row
    const publishBtn = view.findAll((n) => n.type === "button" && n.props?.["aria-label"] === "Publish")[0];
    await publishBtn.props.onClick();
    html = view.toHtml();
    assert.ok(!html.includes("<td class=\"col-status\">Unpublished</td>"));

    // Delete first row
    const deleteBtn = view.findAll((n) => n.type === "button" && n.props?.["aria-label"] === "Delete")[0];
    await deleteBtn.props.onClick();
    html = view.toHtml();
    assert.ok(!html.includes("Admin Uploaded Product"));
  } finally {
    globalThis.fetch = origFetch;
    if (origConfirm !== undefined) {
      globalThis.window.confirm = origConfirm;
    }
  }
});

test("Scenario: Dashboard published-only visibility, unpublish/publish reload, price buckets, images, and empty/error/zero-match states", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = typeof input === "string" && input.startsWith("/")
      ? `${expressBaseUrl}${input}`
      : input;
    return origFetch(url, init);
  };

  try {
    // Seed initial catalog and add an uploaded-image product ($150) + an unpublished product ($250)
    await fetch(`${expressBaseUrl}/api/products`);
    const createUploaded = await fetch(`${expressBaseUrl}/api/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Published GIF Item",
        sku: "GF-1",
        price: 150,
        brandId: "brand-samsung",
        categoryId: "cat-electronics",
        description: "",
        quantity: 3,
        published: true,
        imageFile: { contentType: "image/gif", dataBase64: toBase64(GIF_BYTES) },
      }),
    });
    const { item: gifItem } = await createUploaded.json();

    const createDraft = await fetch(`${expressBaseUrl}/api/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Secret Draft Item",
        sku: "DR-1",
        price: 250,
        brandId: "brand-sony",
        categoryId: "cat-books",
        description: "",
        quantity: 5,
        published: false,
        imageUrl: "https://example.com/draft.png",
      }),
    });
    const { item: draftItem } = await createDraft.json();

    // 1. Mount Dashboard: shows 4 published items, hides Secret Draft Item, price counts exclude draft
    const dash1 = mountInteractive(Dashboard);
    await dash1.flushEffects();
    let html = dash1.toHtml();
    assert.ok(html.includes("4 items"));
    assert.ok(html.includes("Published GIF Item"));
    assert.ok(!html.includes("Secret Draft Item"));
    assert.ok(html.includes(`/api/products/${gifItem.id}/image?v=`));

    // Select $200 to $299 (which only had the unpublished draft item) -> zero-match filter state!
    const checkboxes = dash1.findAll((n) => n.type === "input" && n.props?.type === "checkbox");
    // Checkboxes 0..4 are the 5 price ranges
    checkboxes[2].props.onChange();
    html = dash1.toHtml();
    assert.ok(html.includes("0 items"));
    assert.ok(html.includes("No products match the selected filters."));
    assert.ok(html.includes("$200 to $299 ×"));

    // 2. Publish the draft item via PUT /api/products/:id, then mount Dashboard again
    await fetch(`${expressBaseUrl}/api/products/${draftItem.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draftItem.name,
        sku: draftItem.sku,
        price: draftItem.price,
        brandId: draftItem.brandId,
        categoryId: draftItem.categoryId,
        description: draftItem.description,
        quantity: draftItem.quantity,
        published: true,
        imageUrl: draftItem.imageUrl,
      }),
    });

    const dash2 = mountInteractive(Dashboard);
    await dash2.flushEffects();
    html = dash2.toHtml();
    assert.ok(html.includes("5 items"));
    assert.ok(html.includes("Secret Draft Item"));
    assert.ok(html.includes("https://example.com/draft.png"));

    // 3. Unpublish all products and verify "No products yet." and "0 items"
    const allProducts = (await (await fetch(`${expressBaseUrl}/api/products`)).json()).items;
    for (const prod of allProducts) {
      await fetch(`${expressBaseUrl}/api/products/${prod.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: prod.name,
          sku: prod.sku,
          price: prod.price,
          brandId: prod.brandId,
          categoryId: prod.categoryId,
          description: prod.description,
          quantity: prod.quantity,
          published: false,
          imageUrl: prod.imageUrl,
        }),
      });
    }

    const dashEmpty = mountInteractive(Dashboard);
    await dashEmpty.flushEffects();
    html = dashEmpty.toHtml();
    assert.ok(html.includes("0 items"));
    assert.ok(html.includes("No products yet."));
    assert.ok(!html.includes("No products match the selected filters."));

    // 4. API failure when MONGODB_URI is unset -> renders <p class="message error">MONGODB_URI is not set</p>
    delete process.env.MONGODB_URI;
    const dashError = mountInteractive(Dashboard);
    await dashError.flushEffects();
    html = dashError.toHtml();
    assert.ok(html.includes('<p class="message error">MONGODB_URI is not set</p>'));

    // Also verify Worker returns 500 MONGODB_URI is not set when env.MONGODB_URI is missing
    const workerErr = await callWorker("/api/products", {}, {});
    assert.equal(workerErr.status, 500);
    assert.deepEqual(await workerErr.json(), { error: "MONGODB_URI is not set" });

    // 5. Verify ProductImage fallback placeholder when imageUrl is empty or onError fires
    const imgMount = mountInteractive(ProductImage, { imageUrl: "https://example.com/broken.png" });
    const imgEl = imgMount.renderOnce();
    assert.equal(imgEl.type, "img");
    imgEl.props.onError();
    const svgEl = imgMount.renderOnce();
    assert.equal(svgEl.type, "svg");
    assert.equal(svgEl.props.className, "product-placeholder");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("Scenario: Seed brands, reject a case-insensitive duplicate, update, and block delete while a product uses the brand", async () => {
  const expressList = await fetch(`${expressBaseUrl}/api/brands`);
  assert.equal(expressList.status, 200);
  const { items } = await expressList.json();
  assert.deepEqual(items.map((item) => item.name), [
    "Samsung",
    "Sony",
    "LG",
    "Panasonic",
    "Toshiba",
    "Apple",
    "Electrolux",
    "Daikin",
    "Sharp",
    "Casper",
  ]);
  assert.equal(items[0].id, "brand-samsung");
  assert.equal(items[0].description, "");
  assert.equal(items[0].productCount, 1);
  assert.equal(items.at(-1).id, "brand-casper");
  assert.equal(items.find((item) => item.id === "brand-lg").productCount, 0);

  const duplicate = await callWorker("/api/brands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: " samsung ", description: "ignored" }),
  });
  assert.equal(duplicate.status, 409);
  assert.deepEqual(await duplicate.json(), { error: "A brand with that name already exists" });

  const created = await fetch(`${expressBaseUrl}/api/brands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Acme", description: " Extra " }),
  });
  assert.equal(created.status, 201);
  const { item: acme } = await created.json();
  assert.equal(acme.name, "Acme");
  assert.equal(acme.description, "Extra");
  assert.equal(acme.productCount, 0);
  assert.equal(typeof acme.id, "string");

  const renamed = await fetch(`${expressBaseUrl}/api/brands/${acme.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "acme", description: "Kept" }),
  });
  assert.equal(renamed.status, 200);
  const { item: renamedItem } = await renamed.json();
  assert.equal(renamedItem.name, "acme");
  assert.equal(renamedItem.description, "Kept");
  assert.ok(renamedItem.updatedAt);

  const blocked = await fetch(`${expressBaseUrl}/api/brands/brand-samsung`, { method: "DELETE" });
  assert.equal(blocked.status, 409);
  assert.deepEqual(await blocked.json(), { error: "Move or delete products in this brand first" });

  const removed = await callWorker(`/api/brands/${acme.id}`, { method: "DELETE" });
  assert.equal(removed.status, 200);
  assert.deepEqual(await removed.json(), { deleted: true });

  const missing = await callWorker("/api/brands/missing-brand", { method: "DELETE" });
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "Brand not found" });

  const byId = await callWorker("/api/brands/brand-samsung");
  assert.equal(byId.status, 405);
  assert.deepEqual(await byId.json(), { error: "Method not allowed" });

  const workerList = await callWorker("/api/brands");
  assert.equal(workerList.status, 200);
  const workerItems = (await workerList.json()).items;
  assert.equal(workerItems[0].name, "Samsung");
  assert.equal(workerItems.some((item) => item.id === acme.id), false);
});

test("Runtime parity edge cases: 413 body limit, Worker 400 invalid JSON, and 405 unsupported method on image path", async () => {
  const oversizePayload = JSON.stringify({
    name: "Oversize",
    categoryId: "cat-books",
    price: 10,
    quantity: 1,
    padding: "x".repeat(2097152),
  });

  const exp413 = await fetch(`${expressBaseUrl}/api/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: oversizePayload,
  });
  assert.equal(exp413.status, 413);
  assert.deepEqual(await exp413.json(), { error: "Request body is too large" });

  const wrk413 = await callWorker("/api/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: oversizePayload,
  });
  assert.equal(wrk413.status, 413);
  assert.deepEqual(await wrk413.json(), { error: "Request body is too large" });

  const wrk400 = await callWorker("/api/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not-json",
  });
  assert.equal(wrk400.status, 400);
  assert.deepEqual(await wrk400.json(), { error: "Body must be JSON" });

  const wrk405 = await callWorker("/api/products/prod-mouse/image", {
    method: "POST",
  });
  assert.equal(wrk405.status, 405);
  assert.deepEqual(await wrk405.json(), { error: "Method not allowed" });
});

test("userinfo lookup ignores case, hides passwordHash, and bootstraps one admin", async () => {
  memoryDb.reset();
  const env = {
    MONGODB_URI: TEST_URI,
    MONGODB_DB: "productmanage",
    SESSION_SECRET: SESSION_FIXTURE,
  };
  const created = await createUserinfo(env, {
    username: "Ada",
    email: "Ada@Example.com",
    password: "password123",
  });
  assert.equal(created.passwordHash, undefined);
  assert.equal(created.username, "Ada");
  assert.equal(created.email, "Ada@Example.com");
  const byName = await authenticate(env, { lookup: "username", value: "ada", password: "password123" });
  assert.equal(byName.id, created.id);
  assert.equal(byName.passwordHash, undefined);
  const byEmail = await authenticate(env, { lookup: "email", value: "ada@example.com", password: "password123" });
  assert.equal(byEmail.email, "Ada@Example.com");
  await assert.rejects(
    () => authenticate(env, { lookup: "username", value: "ada", password: "wrong-password" }),
    (error) => error.status === 401 && error.message === "Invalid username, email, or password",
  );
  await assert.rejects(
    () => createUserinfo(env, { username: "other", email: "ada@example.com", password: "password123" }),
    (error) => error.status === 409 && error.message === "A user with that username or email already exists",
  );

  memoryDb.reset();
  const full = {
    ...env,
    AUTH_BOOTSTRAP_USERNAME: "root",
    AUTH_BOOTSTRAP_EMAIL: "root@localhost",
    AUTH_BOOTSTRAP_PASSWORD: "password123",
  };
  await listCategories(full);
  assert.equal(memoryDb.dump("userinfo").length, 1);
  await listCategories(full);
  assert.equal(memoryDb.dump("userinfo").length, 1);

  memoryDb.reset();
  const partial = {
    ...env,
    AUTH_BOOTSTRAP_USERNAME: "root",
    AUTH_BOOTSTRAP_EMAIL: "",
    AUTH_BOOTSTRAP_PASSWORD: "",
  };
  await listCategories(partial);
  assert.equal(memoryDb.dump("userinfo").length, 0);
  await assert.rejects(
    () => authenticate(partial, { lookup: "username", value: "root", password: "password123" }),
    (error) => error.status === 500 && error.message === "Admin bootstrap configuration is incomplete",
  );
});

test("auth HTTP contracts and document redirects match on Express and the Worker", async () => {
  const loginBody = { username: "ada", password: "password123" };

  async function postLogin(body, envOverride) {
    const expressRes = await nativeFetch(`${expressBaseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const workerRes = await callWorker("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, envOverride);
    return { expressRes, workerRes };
  }

  const byName = await postLogin(loginBody);
  assert.equal(byName.expressRes.status, 200);
  const expressUser = await byName.expressRes.json();
  assert.equal(expressUser.user.username, "ada");
  assert.equal(expressUser.user.passwordHash, undefined);
  assert.match(sessionCookieValue(byName.expressRes), /^admin_session=/);
  assert.equal(sessionCookieValue(byName.expressRes).includes("Secure"), false);
  assert.equal(byName.workerRes.status, 200);
  const workerUser = await byName.workerRes.json();
  assert.equal(workerUser.user.email, "ada@example.com");
  assert.equal(workerUser.user.passwordHash, undefined);
  assert.match(sessionCookieValue(byName.workerRes), /^admin_session=/);

  const byEmail = await postLogin({ email: "ADA@example.com", password: "password123" });
  assert.equal(byEmail.expressRes.status, 200);
  assert.equal((await byEmail.expressRes.json()).user.username, "ada");
  assert.match(sessionCookieValue(byEmail.expressRes), /^admin_session=/);
  assert.equal(byEmail.workerRes.status, 200);
  assert.match(sessionCookieValue(byEmail.workerRes), /^admin_session=/);

  const wrong = await postLogin({ username: "ada", password: "wrong-password" });
  assert.equal(wrong.expressRes.status, 401);
  assert.deepEqual(await wrong.expressRes.json(), { error: "Invalid username, email, or password" });
  assert.equal(sessionCookieValue(wrong.expressRes), "");
  assert.equal(wrong.workerRes.status, 401);
  assert.deepEqual(await wrong.workerRes.json(), { error: "Invalid username, email, or password" });
  assert.equal(sessionCookieValue(wrong.workerRes), "");

  const unknown = await postLogin({ username: "nobody", password: "password123" });
  assert.equal(unknown.expressRes.status, 401);
  assert.equal(sessionCookieValue(unknown.expressRes), "");
  assert.equal(unknown.workerRes.status, 401);
  assert.equal(sessionCookieValue(unknown.workerRes), "");

  const blankId = await postLogin({ password: "password123" });
  assert.equal(blankId.expressRes.status, 400);
  assert.deepEqual(await blankId.expressRes.json(), { error: "Username or email is required" });
  assert.equal(blankId.workerRes.status, 400);
  assert.deepEqual(await blankId.workerRes.json(), { error: "Username or email is required" });

  const blankPassword = await postLogin({ username: "ada", password: "   " });
  assert.equal(blankPassword.expressRes.status, 400);
  assert.deepEqual(await blankPassword.expressRes.json(), { error: "Password is required" });
  assert.equal(blankPassword.workerRes.status, 400);
  assert.deepEqual(await blankPassword.workerRes.json(), { error: "Password is required" });

  const notObject = await postLogin([]);
  assert.equal(notObject.expressRes.status, 400);
  assert.deepEqual(await notObject.expressRes.json(), { error: "Body must be a JSON object" });
  assert.equal(sessionCookieValue(notObject.expressRes), "");
  assert.equal(notObject.workerRes.status, 400);
  assert.deepEqual(await notObject.workerRes.json(), { error: "Body must be a JSON object" });
  assert.equal(sessionCookieValue(notObject.workerRes), "");

  const expressBadJson = await nativeFetch(`${expressBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not-json",
  });
  assert.equal(expressBadJson.status, 400);
  assert.equal(typeof (await expressBadJson.json()).error, "string");
  assert.equal(sessionCookieValue(expressBadJson), "");
  const workerBadJson = await callWorker("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not-json",
  });
  assert.equal(workerBadJson.status, 400);
  assert.deepEqual(await workerBadJson.json(), { error: "Body must be JSON" });
  assert.equal(sessionCookieValue(workerBadJson), "");

  const savedSecret = process.env.SESSION_SECRET;
  delete process.env.SESSION_SECRET;
  const noSecretEnv = { ...workerEnv };
  delete noSecretEnv.SESSION_SECRET;
  try {
    const expressMissing = await nativeFetch(`${expressBaseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(loginBody),
    });
    assert.equal(expressMissing.status, 500);
    assert.deepEqual(await expressMissing.json(), { error: "SESSION_SECRET is not set" });
    assert.equal(sessionCookieValue(expressMissing), "");
    const workerMissing = await callWorker("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(loginBody),
    }, noSecretEnv);
    assert.equal(workerMissing.status, 500);
    assert.deepEqual(await workerMissing.json(), { error: "SESSION_SECRET is not set" });
    assert.equal(sessionCookieValue(workerMissing), "");
  } finally {
    process.env.SESSION_SECRET = savedSecret;
  }

  const anonymous = await nativeFetch(`${expressBaseUrl}/api/auth/session`);
  assert.equal(anonymous.status, 200);
  assert.deepEqual(await anonymous.json(), { authenticated: false });
  const workerAnonymous = await callWorker("/api/auth/session");
  assert.deepEqual(await workerAnonymous.json(), { authenticated: false });
  const expressSession = await nativeFetch(`${expressBaseUrl}/api/auth/session`, {
    headers: { cookie: adminCookieHeader },
  });
  const expressSessionBody = await expressSession.json();
  assert.equal(expressSessionBody.authenticated, true);
  assert.equal(expressSessionBody.user.passwordHash, undefined);
  const workerSession = await callWorker("/api/auth/session", { headers: { cookie: adminCookieHeader } });
  assert.equal((await workerSession.json()).authenticated, true);

  const expired = signSession("missing-user", SESSION_FIXTURE, Date.now() - 28800 * 1000 - 5000);
  const expiredExpress = await nativeFetch(`${expressBaseUrl}/api/auth/session`, {
    headers: { cookie: `admin_session=${expired}` },
  });
  assert.deepEqual(await expiredExpress.json(), { authenticated: false });
  const expiredWorker = await callWorker("/api/auth/session", {
    headers: { cookie: `admin_session=${expired}` },
  });
  assert.deepEqual(await expiredWorker.json(), { authenticated: false });
  const [payload, mac] = adminCookieHeader.slice("admin_session=".length).split(".");
  const macBytes = Buffer.from(mac, "base64url");
  macBytes[0] ^= 0xff;
  const tampered = `admin_session=${payload}.${macBytes.toString("base64url")}`;
  const tamperedExpress = await nativeFetch(`${expressBaseUrl}/api/auth/session`, {
    headers: { cookie: tampered },
  });
  assert.deepEqual(await tamperedExpress.json(), { authenticated: false });
  const tamperedWorker = await callWorker("/api/auth/session", { headers: { cookie: tampered } });
  assert.deepEqual(await tamperedWorker.json(), { authenticated: false });

  for (const cookie of [undefined, adminCookieHeader]) {
    const headers = cookie ? { cookie } : undefined;
    const expressLogout = await nativeFetch(`${expressBaseUrl}/api/auth/logout`, { method: "POST", headers });
    assert.equal(expressLogout.status, 200);
    assert.deepEqual(await expressLogout.json(), { ok: true });
    assert.match(sessionCookieValue(expressLogout), /Max-Age=0/);
    const workerLogout = await callWorker("/api/auth/logout", { method: "POST", headers });
    assert.equal(workerLogout.status, 200);
    assert.deepEqual(await workerLogout.json(), { ok: true });
    assert.match(sessionCookieValue(workerLogout), /Max-Age=0/);
  }

  const workerMethod = await callWorker("/api/auth/login", { method: "GET" });
  assert.equal(workerMethod.status, 405);
  assert.deepEqual(await workerMethod.json(), { error: "Method not allowed" });

  for (const page of ["/products", "/brands", "/categories"]) {
    const expressPage = await nativeFetch(`${expressBaseUrl}${page}`, { redirect: "manual" });
    assert.equal(expressPage.status, 302);
    assert.equal(locationPath(expressPage), "/login");
    const workerPage = await callWorker(page);
    assert.equal(workerPage.status, 302);
    assert.equal(locationPath(workerPage), "/login");
  }
  const expressLogin = await nativeFetch(`${expressBaseUrl}/login`, {
    redirect: "manual",
    headers: { cookie: adminCookieHeader },
  });
  assert.equal(expressLogin.status, 302);
  assert.equal(locationPath(expressLogin), "/products");
  const workerLogin = await callWorker("/login", { headers: { cookie: adminCookieHeader } });
  assert.equal(workerLogin.status, 302);
  assert.equal(locationPath(workerLogin), "/products");
  const expressRoot = await nativeFetch(`${expressBaseUrl}/`, { redirect: "manual" });
  assert.equal(expressRoot.status, 302);
  assert.equal(locationPath(expressRoot), "/dashboard");
  const workerRoot = await callWorker("/");
  assert.equal(workerRoot.status, 302);
  assert.equal(locationPath(workerRoot), "/dashboard");
});

test("unauthenticated catalog writes return 401 and catalog reads stay public", async () => {
  for (const collection of ["products", "brands", "categories"]) {
    const path = `/api/${collection}`;
    const beforeCount = memoryDb.dump(collection).length;
    const expressWrite = await nativeFetch(`${expressBaseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Nope" }),
    });
    assert.equal(expressWrite.status, 401);
    assert.deepEqual(await expressWrite.json(), { error: "Authentication required" });
    const workerWrite = await callWorker(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-anonymous": "1" },
      body: JSON.stringify({ name: "Nope" }),
    });
    assert.equal(workerWrite.status, 401);
    assert.deepEqual(await workerWrite.json(), { error: "Authentication required" });
    assert.equal(memoryDb.dump(collection).length, beforeCount);
    const expressRead = await nativeFetch(`${expressBaseUrl}${path}`);
    assert.equal(expressRead.status, 200);
    assert.ok(Array.isArray((await expressRead.json()).items));
    const workerRead = await callWorker(path);
    assert.equal(workerRead.status, 200);
    assert.ok(Array.isArray((await workerRead.json()).items));
  }
});

