# Memory Init Report

**Date:** 2026-11-02
**Agent:** memory-init
**Repo HEAD:** `072e0d177452e088e9297bd22996c7b0e2f188dd` on branch `main`

No commit was created. `approvals.md` was not modified. Lifecycle is `pending-approval`, not `approved`.

## Sources analyzed

| Path | Used for |
|---|---|
| `README.md` | Local and Worker setup, route table. Layout claim about json-config-server left UNCONFIRMED. |
| `package.json`, `web/package.json`, `.nvmrc` | Node 22, ESM, npm workspaces, dependency versions, `npm test` scope. |
| `openspec/config.yaml` | Parity, secrets, and stack rules. |
| `openspec/specs/product-management/spec.md` | Product API and `/products` UI rules. |
| `openspec/specs/category-management/spec.md` | Category API and `/categories` UI rules. |
| `openspec/specs/product-dashboard/spec.md` | Dashboard filters, sort, layout, and non-excluding stock/color behavior. |
| `src/store.js` | Entities, validation, seed, index, per-request client. |
| `src/app.js`, `src/routes/*.js`, `src/worker.js`, `src/env.js`, `server.js` | Runtime split and HTTP mapping. |
| `web/src/**` | Pages, cart, wishlist, catalog view. |
| `web/src/index.css` | Dashboard breakpoints. |
| `web/src/catalogView.test.js` | What `npm test` actually covers. |
| `wrangler.toml`, `scripts/build-web.mjs`, `scripts/with-node.cmd` | Worker build, assets, vars, encryption alias. |
| `.env.example`, `.dev.vars.example`, `.gitignore` | Secret names only. Values were not copied. |
| `.ai/memory/_templates/` | File structure. Templates were not edited. |

`data/db.json` is present locally and gitignored. It was not opened and is not imported by source.

Servers and MongoDB were not started.

## Files created

| File | Summary |
|---|---|
| `project-overview.md` | Catalog purpose, surfaces, spec links. |
| `architecture.md` | Express, Worker, store, and web flow. |
| `domain-model.md` | Category and product fields, seed data, UI-only concepts. |
| `tech-stack.md` | Node 22, Express, Worker, React 19, Vite, Mongo driver. |
| `conventions.md` | Layout, API envelopes, frontend patterns. |
| `runtime-parity.md` | Shared store and the known adapter gaps. |
| `security.md` | URI handling, validation, no auth. |
| `testing.md` | `npm test` scope and coverage gaps. |
| `glossary.md` | Workflow and catalog terms. |
| `known-issues.md` | KI-001 through KI-008. |
| `modules/products.md` | Admin products and cart. |
| `modules/categories.md` | Categories and name uniqueness. |
| `modules/dashboard.md` | Storefront filters and layout. |
| `modules/store.md` | Shared Mongo access. |
| `apis/products.md` | `/api/products` contract. |
| `apis/categories.md` | `/api/categories` contract. |
| `apis/pages.md` | HTML routes and unknown API paths. |
| `decisions/001-dual-express-worker-runtime.md` | Two adapters, one store. |
| `decisions/002-per-request-mongo-client.md` | No cached Mongo client. |
| `decisions/003-mongodb-uri-outside-source.md` | URI is runtime-only. |
| `INDEX.md` | Refreshed map and statuses. |
| `STATUS.md` | Lifecycle `pending-approval`, version 1, agent `memory-init`. |
| `reports/init-report.md` | This report. |

## UNCONFIRMED items needing human review

- README says the admin layout follows json-config-server. No dependency or import was found.
- Dashboard spec says unknown client paths route to `/dashboard`. That is true in React after HTML loads, and the Worker assets use SPA fallback. Express does not register a catch-all page route. Exact status for an unknown Express path was not executed.
- Exact Express status and body for an unsupported API method and for invalid JSON were not executed. Code shows no 405 handler and a different JSON error path than the Worker.
- Category collation strength 2 is diacritic-sensitive. The spec only says case-insensitive.
- Image URL length 2048 is code, not spec text.
- Whether `data/db.json` is an obsolete file store was not confirmed by reading it.
- Cross-origin API access is not implemented. Nothing in the specs requires it.

## Suggested follow-ups

- Human GM0: append an `approved` or `rejected` row to `.ai/memory/approvals.md`. On approval, set `STATUS.md` lifecycle to `approved`. Feature agents must not start before that.
- Optional later work, only under a feature change: API/store tests, and aligning Express 405 / invalid JSON with the Worker if the product should treat those as one contract.
