# Tasks

Implementation follows the approved `product-dashboard` spec and `design.md`. Do not change `src/store.js` or the product and category route modules. Task groups are ordered: group 2 depends on group 1, group 3 depends on group 2, group 4 depends on groups 1 and 3, and group 5 depends on groups 2 through 4.

## 1. Database and API contract

- [x] 1.1 Leave MongoDB collections, validation, seed data, and indexes unchanged. Confirm `products` still has no image, stock, color, weight, or best-seller field, and that the dashboard does not write documents.
- [x] 1.2 Keep `GET /api/products` as `{ items }` with `id`, `name`, `sku`, `price`, `categoryId`, `categoryName`, `description`, `createdAt`, and optional `updatedAt`, ordered by `createdAt` descending. Keep `POST`, `PUT`, and `DELETE` on `/api/products` and the `/api/categories` contract unchanged on both Express and the Worker.
- [x] 1.3 Keep a missing `MONGODB_URI` as HTTP 500 `{ "error": "MONGODB_URI is not set" }`. Do not add the URI to source control or `wrangler.toml`.

## 2. Catalog projection and unit tests

Depends on group 1. The tests describe the stored product shape. They do not need a database.

- [x] 2.1 Add `web/src/catalogView.js` with the sort, price, and color catalogs, `productIsInStock`, `matchesColor`, `priceBucket`, `countPriceRanges`, `filterProducts`, `sortProducts`, `activeChips`, `clearChip`, `formatPrice`, and `viewCatalog`. No React import.
- [x] 2.2 Add `web/src/catalogView.test.js` and `"test": "node --test web/src/catalogView.test.js"` in the root `package.json`. Cover option order, half-open price bounds, seed counts `3, 0, 0, 0, 0`, price OR, counts that ignore other filters, in-stock and color non-exclusion, newest and price tie-breaks, unstored sort order, chip order and removal, the featured split, and `$24.50` / `$18.00` formatting.
- [x] 2.3 Run `npm test` and require every case in 2.2 to pass. Add no npm dependency.

## 3. Frontend components

Depends on group 2. Panels call `viewCatalog` and the exported catalogs. They do not copy bucket bounds.

- [x] 3.1 Add `FilterPanel.jsx` with the six sort radios, collapsible Availability, Price, and Color sections, `aria-expanded`, `aria-controls`, `aria-pressed`, and the `hidden` attribute when a section is collapsed.
- [x] 3.2 Add `ProductPanel.jsx` with `<N> items`, chips named `Remove <label>`, the featured tile, standard cards, the shared inline SVG placeholder, and the loading, error, empty-catalog, and zero-match messages.
- [x] 3.3 Add `Dashboard.jsx` to fetch `GET /api/products` once, ignore a stale response after unmount, hold filter and heart state in memory, and pass `viewCatalog` output to the panels. Heart and BUY NOW must not call `fetch`.
- [x] 3.4 Append scoped rules in `web/src/index.css` for the white dashboard page, the button-padding reset, the divider, and the 5 / 3 / 2 / 1 column breakpoints. Do not restyle admin classes.

## 4. Routing and documentation

Depends on group 1 for the unchanged API, and on group 3 for the Dashboard route element. Express and the Worker change together.

- [x] 4.1 Update `App.jsx`: nav order Dashboard, Products, Categories; routes for `/dashboard`, `/products`, and `/categories`; `/` and `*` redirect to `/dashboard`; title `Dashboard`; no admin `<h1>` on the dashboard; `page page-dashboard` only on that route.
- [x] 4.2 Update `src/app.js` so `pagePaths` includes `/dashboard` and `GET /` redirects to `/dashboard`. Update `src/worker.js` so `GET /` redirects with `new URL("/dashboard", url)` and status 302. Do not add `/dashboard` to `run_worker_first`.
- [x] 4.3 Update the README so `GET /` redirects to `/dashboard` and `GET /dashboard` is the dashboard page. Leave the API rows unchanged.

## 5. Verification

Depends on groups 2, 3, and 4.

- [x] 5.1 Re-run `npm test` after the UI and routes are in place.
- [x] 5.2 On Express with `MONGODB_URI` set, check the dashboard checklist: 302 from `/`, six sorts, In Stock Only chip, price counts `3, 0, 0, 0, 0`, eight swatches, featured tile plus standard cards, column breakpoints, BUY NOW with no new request, heart reset on reload, the API error state, and `0 items` for `$400 and up`.
- [x] 5.3 Check `/products` list, create, edit, and delete, and `/categories` list, without changing their gray 1100px layout. Confirm `GET /api/products` and `GET /api/categories` still return `{ items }`.
- [x] 5.4 Compare `src/worker.js` with `src/app.js` for the same `/dashboard` redirect. A live Worker preview is optional when Worker secrets are not available; record that limit instead of changing `wrangler.toml`.

## Workflow follow-up

- Sync `product-dashboard` delta specifications into `openspec/specs/product-dashboard/spec.md` and archive the completed change under `openspec/changes/archive/2026-11-02-product-dashboard/`.
