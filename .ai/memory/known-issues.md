# Known Issues

**Last updated:** 2026-11-02

Open items only. Remove or move to changelog when fixed.

| ID | Severity | Area | Description | Workaround | Tracking |
|---|---|---|---|---|---|
| KI-001 | medium | tests | `npm test` covers only `web/src/catalogView.test.js`. Store validation, seed, Express, Worker, and React pages have no automated tests. | Review `src/store.js` against the OpenSpec specs and exercise the API by hand. | `package.json` script `test` |
| KI-002 | medium | parity | Worker returns 405 for an unsupported method on a matched API path and 400 `"Body must be JSON"` for a bad body. Express has no 405 branch and forwards the JSON parser error message. Unknown non-API paths are page-handled only for three routes on Express; the Worker can serve the SPA fallback. Exact Express HTTP status for those cases was not executed during init. | Keep new verbs implemented in both adapters. Do not assume a 405 on Express. | [runtime-parity.md](runtime-parity.md) |
| KI-003 | medium | security | No authentication or authorization on pages or APIs. Anyone who can reach the host can mutate the catalog. | Network-level restriction outside this repo. | `src/app.js`, `src/worker.js` |
| KI-004 | low | store | `ensureSeed` returns when either collection is non-empty, and it swallows Mongo duplicate-key `11000`. Concurrent first requests can leave categories without the starter products, after which later requests will not seed. | Insert the starter products manually, or empty both collections and retry a single request. | `src/store.js` `ensureSeed` |
| KI-005 | low | store | `indexesReady` is a module global. After one successful `createIndex`, later calls in that isolate skip index creation even if `MONGODB_DB` points at a different database. | Restart the process after changing the database name. | `src/store.js` |
| KI-006 | low | repo | `data/db.json` exists on disk in this workspace, is gitignored, and is not imported by current source. Contents were not read. | Leave it out of commits. Do not revive it without a decision. | `.gitignore` |
| KI-007 | info | dashboard | In Stock Only and color filters never exclude products, even though products have `quantity`. This matches the current dashboard spec and the comments in `catalogView.js`. | Change the spec before changing the predicates. | `openspec/specs/product-dashboard/spec.md` |
| KI-008 | info | api | Image URL max length 2048 is enforced in `optionalImageUrl` and is not stated in `openspec/specs/product-management/spec.md`. | Treat the code limit as current behavior until a spec update says otherwise. | `src/store.js` |

## Retired

| ID | Resolved in | Notes |
|---|---|---|
| | | None at initial baseline. |
