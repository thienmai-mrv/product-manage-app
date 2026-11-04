# Review Report: add-brand-manage

**Reviewer agent:** cursor
**Branch:** feature/add-brand-manage
**Base:** main

## Scope reviewed

- OpenSpec change artifacts under `openspec/changes/add-brand-manage/`: `proposal.md`, `design.md`, `tasks.md`, `approvals.md` (G1–G4 all `approved`), `specs/brand-management/spec.md`, `specs/product-management/spec.md`, `specs/product-dashboard/spec.md`, `reports/development-report.md`, and `reports/test-report.md`.
- Complete diff `git diff main...HEAD` across backend store and adapters (`src/store.js`, `src/routes/brands.js`, `src/app.js`, `src/worker.js`), frontend components and pure catalog view (`web/src/App.jsx`, `web/src/components/Brands.jsx`, `web/src/components/Products.jsx`, `web/src/components/Dashboard.jsx`, `web/src/components/FilterPanel.jsx`, `web/src/catalogView.js`, `web/src/index.css`), documentation (`README.md`), and automated test suites (`web/src/catalogView.test.js`, `src/qa-scenarios.test.js`, `src/brand-qa.test.js`).

## Spec and design conformance

- **`brand-management`**:
  - `src/store.js` creates the case-insensitive unique index `brand_name_ci` (`{ locale: "en", strength: 2 }`) in `ensureIndexes` before setting `indexesReady = true`.
  - `ensureBrandSeed` seeds the 10 Dien May Xanh sample brands (`brand-samsung` through `brand-casper`, spaced 1 second apart so `Samsung` is newest) whenever `brands.countDocuments()` is 0, swallowing only Mongo duplicate-key `11000`.
  - `listBrands`, `addBrand`, `updateBrand`, and `deleteBrand` enforce trimmed non-empty `name` (`400 "Name is required"`), case-insensitive uniqueness (`409 "A brand with that name already exists"`), missing brand detection (`404 "Brand not found"`), computed `productCount` from `products.brandId`, and deletion guard (`409 "Move or delete products in this brand first"`).
  - Express (`src/routes/brands.js`, `src/app.js`) and Cloudflare Worker (`src/worker.js`) expose identical `/api/brands` endpoints, status codes (`200`, `201`, `400`, `404`, `409`, `500`), and JSON response bodies, plus `/brands` in Express `pagePaths`.
  - `web/src/components/Brands.jsx` and `web/src/App.jsx` serve `/brands` at up to `1600px` (`page page-wide`), set `document.title` and `<h1>` to `Brands`, order navigation `Dashboard | Products | Brands | Categories`, and support inline add, edit, and `window.confirm` delete.
- **`product-management`**:
  - `ensureSeed` assigns `Samsung`, `Sony`, and `Panasonic` (`brand-samsung`, `brand-sony`, `brand-panasonic`) to starter products `Wireless Mouse`, `Field Guide`, and `Desk Lamp`, with fallback to the newest brand.
  - `addProduct` and `updateProduct` validate `brandId` (`400 "Brand is required"` and `400 "Brand not found"`) immediately after `name` and before `categoryId`. `toProduct` returns `brandId` (`""` when missing) and resolved `brandName` (`""` when unresolved) without backfilling legacy documents.
  - `web/src/components/Products.jsx` loads `/api/brands` in parallel with products and categories, renders the `Brand` column and form `<select>` immediately before `Category`, defaults `brandId` to `brands[0].id` on add and `item.brandId || ""` on edit, and passes `brandId: item.brandId ?? ""` on stock and publish toggles.
- **`product-dashboard`**:
  - `web/src/catalogView.js`, `web/src/components/FilterPanel.jsx`, and `web/src/components/Dashboard.jsx` fetch `/api/brands` in parallel on mount, render a collapsible `Brands` checkbox filter section after `Price` and before `Categories` (`No brands yet.` when empty), filter published products in memory by the OR union of `brandIds` combined with AND across availability, category, and price filters, keep whole-catalog price bucket counts fixed to all published products, and emit removable brand chips before category chips while keeping product cards unchanged.

## Code quality

- Express and Cloudflare Worker runtime parity is maintained across all routes and error handlers.
- Store validation and seeding logic live in `src/store.js` and are shared by both runtimes.
- Frontend components follow established repository conventions (JSDoc comments, `useEffect` with `cancelled` guard, `requestJson` error handling into `.message.error`, no external state library).

## Security

- **Secrets and credentials**: No `MONGODB_URI`, credentials, `.env`, or `.dev.vars` files appear in the diff, source files, or `wrangler.toml`. Missing `MONGODB_URI` still returns HTTP 500 `{ "error": "MONGODB_URI is not set" }` and other 500 errors remain masked as `"Request failed"`.
- **Input validation and injection**: Server-side validation in `src/store.js` trims strings, validates required `name` and `brandId` against existing documents, and uses parameterized MongoDB queries. All React views render brand names and descriptions as text nodes with no `dangerouslySetInnerHTML`. Sample brand seeding uses a static in-memory list and makes no outbound network requests.
- **Dependencies**: No changes to `package.json`, `package-lock.json`, `web/package.json`, `web/package-lock.json`, or `wrangler.toml`.

## Test evidence

- `openspec/changes/add-brand-manage/reports/test-report.md` records `Overall recommendation: PASS` with all 37 spec scenarios passing.
- Re-ran `npm test`: 51 passed, 0 failed (`web/src/catalogView.test.js`, `src/productInput.test.js`, `web/src/productImage.test.js`, `src/qa-scenarios.test.js`).
- Re-ran `node --test src/brand-qa.test.js`: 4 end-to-end scenario suites passed, 0 failed.

## Findings

| ID | Severity | File | Finding | Resolution |
|---|---|---|---|---|
| — | none | — | No blockers, defects, or security issues found. | Approved as implemented. |

**Decision:** APPROVED
**Pull request:** pending
