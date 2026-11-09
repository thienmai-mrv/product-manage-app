import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer as createViteServer } from "vite";

const transitionQueue = [];
let deferTransitions = false;
let vite;
let App;

/**
 * Hold router location updates while a logout click is in flight.
 * React Router commits navigate() in a transition, after an urgent setUser(null).
 * The admin guard can then mount Navigate to /login and that effect wins.
 * Applying the held location only after that urgent render keeps the regression visible.
 */
function isRouterUpdate(value) {
  return Boolean(
    value
    && typeof value === "object"
    && typeof value.action === "string"
    && typeof value.location?.pathname === "string",
  );
}

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
        const resolved = typeof next === "function" ? next(inst.states[idx]) : next;
        if (deferTransitions && isRouterUpdate(resolved)) {
          transitionQueue.push(() => {
            inst.states[idx] = resolved;
          });
          return;
        }
        inst.states[idx] = resolved;
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
        || deps.some((dep, index) => !Object.is(dep, prev.deps[index]));
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
      return node.map((child, index) => expand(child, `${nodePath}/${child?.key ?? index}`));
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
      const res = runComponent((props) => node.type(props), node.props || {}, undefined, key);
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
    for (const [key, inst] of instances) {
      if (!seenPaths.has(key)) {
        for (const effect of inst.effects) {
          if (typeof effect?.cleanup === "function") {
            effect.cleanup();
          }
        }
        instances.delete(key);
      }
    }
    return tree;
  }

  function flushEffects() {
    for (const inst of Array.from(instances.values())) {
      for (const effect of inst.effects) {
        if (effect?.pending) {
          effect.pending = false;
          if (typeof effect.cleanup === "function") {
            effect.cleanup();
          }
          effect.cleanup = effect.cb();
        }
      }
    }
  }

  async function settle() {
    for (let pass = 0; pass < 8; pass++) {
      renderOnce();
      let ran = false;
      for (const inst of Array.from(instances.values())) {
        for (const effect of inst.effects) {
          if (effect?.pending) {
            effect.pending = false;
            ran = true;
            if (typeof effect.cleanup === "function") {
              effect.cleanup();
            }
            effect.cleanup = effect.cb();
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
      for (const effect of inst.effects) {
        if (typeof effect?.cleanup === "function") {
          effect.cleanup();
        }
      }
    }
    instances.clear();
  }

  return { renderOnce, flushEffects, settle, findAll, toHtml, unmount };
}

before(async () => {
  vite = await createViteServer({
    root: "web",
    configFile: "web/vite.config.js",
    server: { middlewareMode: true },
    appType: "custom",
    optimizeDeps: { noDiscovery: true },
  });
  ({ default: App } = await vite.ssrLoadModule("/src/App.jsx"));
});

after(async () => {
  deferTransitions = false;
  if (vite) {
    await vite.close();
  }
});

test("logout from an admin page opens /dashboard when the session clear renders before navigation", async () => {
  const origDocument = globalThis.document;
  const origWindow = globalThis.window;
  const origFetch = globalThis.fetch;
  globalThis.document = { title: "" };
  globalThis.window = { confirm() { return true; } };
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (url === "/api/auth/session") {
      return Response.json({ authenticated: true, user: { username: "Ada", email: "ada@example.com" } });
    }
    if (url === "/api/auth/logout") {
      return Response.json({ ok: true });
    }
    if (url === "/api/products" || url === "/api/brands" || url === "/api/categories") {
      return Response.json({ items: [] });
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  };

  try {
    for (const path of ["/products", "/brands", "/categories", "/dashboard"]) {
      const app = mountRouterApp(App, [path]);
      await app.settle();
      const logout = app.findAll((node) => node.type === "button" && node.props?.className === "nav-auth")[0];
      assert.equal(logout?.props?.children, "Logout", `${path} shows Logout before the click`);

      transitionQueue.length = 0;
      deferTransitions = true;
      try {
        await logout.props.onClick();
        if (path !== "/dashboard") {
          assert.ok(
            transitionQueue.length >= 1,
            `${path} logout must move to /dashboard after the signed-in render`,
          );
        }
        app.renderOnce();
        app.flushEffects();
        const pending = transitionQueue.splice(0);
        deferTransitions = false;
        for (const callback of pending) {
          callback();
        }
        await app.settle();
      } finally {
        deferTransitions = false;
      }

      assert.equal(globalThis.document.title, "Dashboard", `${path} logout title`);
      const html = app.toHtml();
      assert.match(html, /<button type="button" class="nav-auth">Login<\/button>/, `${path} shows Login`);
      assert.equal(html.includes("<h1>Login</h1>"), false, `${path} logout must not open /login`);
      assert.equal(html.includes("<h1>"), false, `${path} logout stays on the dashboard`);
      app.unmount();
    }
  } finally {
    deferTransitions = false;
    globalThis.document = origDocument;
    globalThis.window = origWindow;
    globalThis.fetch = origFetch;
  }
});
