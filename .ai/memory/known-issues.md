# Known Issues

**Last updated:** 2026-11-04

Open items only. Remove or move to changelog when fixed.

| ID | Severity | Area | Description | Workaround | Tracking |
|---|---|---|---|---|---|
| KI-001 | medium | tests | `npm test` runs `web/src/catalogView.test.js`, `src/productInput.test.js`, `web/src/productImage.test.js`, and `src/qa-scenarios.test.js`. It does not run `src/brand-qa.test.js`. The reviewer ran that file separately with `node --test src/brand-qa.test.js`. `qa-scenarios.test.js` covers one brand seed, duplicate, update, and delete path against an in-memory Mongo harness. It is not a full brand HTTP matrix. | Treat `npm test` as the workflow gate. Run `src/brand-qa.test.js` when the longer brand UI and parity scenarios need a re-check. | `package.json` script `test` |
| KI-002 | medium | parity | Worker returns 405 for an unsupported method on a matched API path and 400 `"Body must be JSON"` for a bad body. Express has no 405 branch and forwards the JSON parser error message. Unknown non-API paths are page-handled only for `/dashboard`, `/products`, `/brands`, and `/categories` on Express; the Worker can serve the SPA fallback. The brand regex uses the same 405 split. add-brand-manage did not close this gap. | Keep new verbs implemented in both adapters. Do not assume a 405 on Express. | [runtime-parity.md](runtime-parity.md) |
| KI-003 | medium | security | No authentication or authorization on pages or APIs. Anyone who can reach the host can mutate the catalog. | Network-level restriction outside this repo. | `src/app.js`, `src/worker.js` |
| KI-004 | low | store | `ensureBrandSeed` inserts the ten sample brands only when `brands` is empty and swallows duplicate-key `11000`. Two first requests can both see an empty `brands` collection. `ensureSeed` still returns without starter categories and products when either of those collections is non-empty, and it also swallows `11000`. Concurrent first requests can leave categories without the starter products, after which later requests will not seed products. | Insert the missing rows manually, or empty the relevant collections and retry a single request. | `src/store.js` `ensureBrandSeed`, `ensureSeed` |
| KI-005 | low | store | `indexesReady` is a module global. After one successful index pass, later calls in that isolate skip index creation even if `MONGODB_DB` points at a different database. `ensureIndexes` creates `category_name_ci` and `brand_name_ci` before setting the flag. A process that already set the flag on older code does not create `brand_name_ci` until restart. | Restart the process after changing the database name or after deploying the brand index onto a warm isolate. | `src/store.js` |
| KI-006 | low | repo | `data/db.json` exists on disk in this workspace, is gitignored, and is not imported by current source. Contents were not read. | Leave it out of commits. Do not revive it without a decision. | `.gitignore` |
| KI-007 | info | dashboard | `productIsInStock` excludes `inStock === false` and was already implemented that way on `main`. It does not read `quantity`. Color swatches and weight sorts are still required by `openspec/specs/product-dashboard/spec.md` and are absent from `catalogView.js` and `FilterPanel.jsx` on `main` and on this branch. The file comment still says the non-excluding predicates live in that module. add-brand-manage did not add or remove those controls. | Do not treat the missing color and weight controls as part of the brand filter. Change the spec before adding them back. | `openspec/specs/product-dashboard/spec.md` |
| KI-008 | info | api | Image URL max length 2048 is enforced in `optionalImageUrl` and is not stated in `openspec/specs/product-management/spec.md`. | Treat the code limit as current behavior until a spec update says otherwise. | `src/store.js` |

## Retired

| ID | Resolved in | Notes |
|---|---|---|
| | | None at initial baseline. |
