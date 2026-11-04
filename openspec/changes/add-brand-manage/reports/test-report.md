# Test Report: add-brand-manage

**QA agent:** cursor
**Branch:** feature/add-brand-manage
**Iteration:** 1

## Environment and scope

- Windows 11 with Node.js 22 ESM (`"type": "module"`). No live MongoDB server or browser session was available (`.env` and `.dev.vars` are absent, and `MONGODB_URI` is unset in the environment).
- `npm test` runs `web/src/catalogView.test.js`, `src/productInput.test.js`, `web/src/productImage.test.js`, and `src/qa-scenarios.test.js` (51 tests).
- Added `src/brand-qa.test.js` (4 end-to-end scenario suites) to cover every remaining `add-brand-manage` scenario across Express (`src/app.js`), Cloudflare Worker (`src/worker.js`), shared store (`src/store.js` with an in-memory `MongoClient` stub), and React UI components (`App.jsx`, `Brands.jsx`, `Products.jsx`, `Dashboard.jsx`, `FilterPanel.jsx`, `ProductPanel.jsx`).
- Verified production frontend asset compilation with `npm run build:web`.

## Scenario coverage

Every scenario in `specs/**/spec.md` appears here.

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| List brands with product counts (`brand-management`) | Fetch brands from non-empty catalog | `src/qa-scenarios.test.js` and `src/brand-qa.test.js`: `GET /api/brands` on Express and Worker returns HTTP 200 `{ items }` ordered by `createdAt` descending with `id`, `name`, `description`, `createdAt`, optional `updatedAt`, and accurate `productCount`. | Pass |
| List brands with product counts (`brand-management`) | Seed Dien May Xanh sample brands when brand catalog is empty | `src/qa-scenarios.test.js` and `src/brand-qa.test.js`: Empty `brands` collection seeds the 10 sample brands (`Samsung`, `Sony`, `LG`, `Panasonic`, `Toshiba`, `Apple`, `Electrolux`, `Daikin`, `Sharp`, `Casper`) both on a completely empty database and when `categories`/`products` already exist. | Pass |
| Create brand with unique case-insensitive name (`brand-management`) | Create valid brand | `src/qa-scenarios.test.js` and `src/brand-qa.test.js`: `POST /api/brands` with trimmed `name` and optional `description` returns HTTP 201 `{ item }` with UUID `id`, `createdAt`, and `productCount: 0`. | Pass |
| Create brand with unique case-insensitive name (`brand-management`) | Reject missing brand name | `src/brand-qa.test.js`: `POST /api/brands` with `""` or whitespace-only `name` returns HTTP 400 `{ "error": "Name is required" }` on Express and Worker. | Pass |
| Create brand with unique case-insensitive name (`brand-management`) | Reject duplicate brand name ignoring case | `src/qa-scenarios.test.js`: `POST /api/brands` with `" samsung "` returns HTTP 409 `{ "error": "A brand with that name already exists" }`. | Pass |
| Update existing brand (`brand-management`) | Update brand name and description | `src/qa-scenarios.test.js` and `src/brand-qa.test.js`: `PUT /api/brands/:id` updates `name` and `description` (including case-only rename of own name), sets `updatedAt`, and returns HTTP 200 `{ item }` with current `productCount`. | Pass |
| Update existing brand (`brand-management`) | Update non-existent brand | `src/brand-qa.test.js`: `PUT /api/brands/does-not-exist` returns HTTP 404 `{ "error": "Brand not found" }` on Express and Worker. | Pass |
| Update existing brand (`brand-management`) | Reject rename to an existing brand name | `src/brand-qa.test.js`: `PUT /api/brands/brand-sony` with `" sAmSuNg "` or `"SAMSUNG"` returns HTTP 409 `{ "error": "A brand with that name already exists" }` on Express and Worker. | Pass |
| Delete empty brand only (`brand-management`) | Delete brand with zero products | `src/qa-scenarios.test.js` and `src/brand-qa.test.js`: `DELETE /api/brands/:id` for a brand with zero products deletes the brand and returns HTTP 200 `{ "deleted": true }`. | Pass |
| Delete empty brand only (`brand-management`) | Block deletion of brand with assigned products | `src/qa-scenarios.test.js` and `src/brand-qa.test.js`: `DELETE /api/brands/brand-samsung` while referenced by `prod-mouse` retains the brand and returns HTTP 409 `{ "error": "Move or delete products in this brand first" }` on Express and Worker. | Pass |
| Delete empty brand only (`brand-management`) | Delete non-existent brand | `src/qa-scenarios.test.js` and `src/brand-qa.test.js`: `DELETE /api/brands/:id` for a missing id returns HTTP 404 `{ "error": "Brand not found" }` on Express and Worker. | Pass |
| Brands administrative UI and navigation order (`brand-management`) | View and manage brands on admin page | `src/brand-qa.test.js`: `/brands` renders `.page.page-wide` (1600px max), `<h1>Brands</h1>`, nav menu `Dashboard \| Products \| Brands \| Categories` with `Brands` active, loads `GET /api/brands`, renders `No`, `Name`, `Description`, `Products`, `Action`, supports inline `Add` and `Edit`, and shows `No brands yet.` when empty. | Pass |
| Brands administrative UI and navigation order (`brand-management`) | Delete a brand after confirmation | `src/brand-qa.test.js`: Clicking `Delete` on `/brands` calls `window.confirm("Delete <name>?")`; cancelling leaves the row untouched; confirming deletes an empty brand or displays `"Move or delete products in this brand first"` in `.message.error`. | Pass |
| Assign and validate product brand (`product-management`) | Choose a brand when adding or editing a product on the products page | `src/brand-qa.test.js`: On `/products`, Add defaults `Brand` `<select>` to `brands[0].id` (`brand-samsung`), Edit defaults to `item.brandId` (or `""` for legacy rows without substituting `brands[0]`), and saving persists the chosen `brandId`. | Pass |
| Assign and validate product brand (`product-management`) | Reject product with missing or unknown brand | `src/qa-scenarios.test.js` and `src/brand-qa.test.js`: `POST /api/products` and `PUT /api/products/:id` return HTTP 400 `{ "error": "Brand is required" }` for blank `brandId` and `{ "error": "Brand not found" }` for unknown `brandId` on Express and Worker. | Pass |
| List products with resolved category names (`product-management`) | Fetch products from catalog | `src/qa-scenarios.test.js` and `src/brand-qa.test.js`: `GET /api/products` returns HTTP 200 `{ items }` ordered by `createdAt` descending with `brandId`, resolved `brandName`, `categoryId`, and resolved `categoryName` (or `""` when missing). | Pass |
| List products with resolved category names (`product-management`) | Seed starter products on first request | `src/qa-scenarios.test.js`: First request on empty catalog seeds the 10 sample brands, 3 categories, and 3 starter products (`Wireless Mouse` -> `Samsung`, `Field Guide` -> `Sony`, `Desk Lamp` -> `Panasonic`). | Pass |
| Create product with validated fields (`product-management`) | Create valid product | `src/qa-scenarios.test.js`: `POST /api/products` with valid `name`, `brandId`, `categoryId`, `price`, and `quantity` returns HTTP 201 `{ item }` with generated UUID `id`, `createdAt`, `brandId`, and resolved `brandName`. | Pass |
| Create product with validated fields (`product-management`) | Reject product with missing name or invalid category | `src/qa-scenarios.test.js`: `POST /api/products` returns HTTP 400 with `"Name is required"`, `"Brand is required"`, `"Brand not found"`, `"Category is required"`, or `"Category not found"` on Express and Worker. | Pass |
| Create product with validated fields (`product-management`) | Reject product with negative or non-numeric price | `src/qa-scenarios.test.js`: `POST /api/products` with `-1` or `"abc"` returns HTTP 400 `{ "error": "Price must be a number that is zero or greater" }` on Express and Worker. | Pass |
| Create product with validated fields (`product-management`) | Reject product with an invalid image or quantity | `src/qa-scenarios.test.js` and `src/productInput.test.js`: Invalid image URL/file or negative/fractional `quantity` returns HTTP 400 `{ "error": "<message>" }` on Express and Worker. | Pass |
| Update existing product (`product-management`) | Update product fields | `src/qa-scenarios.test.js` and `src/brand-qa.test.js`: `PUT /api/products/:id` updates product fields including `brandId`, sets `updatedAt`, and returns HTTP 200 `{ item }` with updated `brandId` and resolved `brandName`. | Pass |
| Update existing product (`product-management`) | Update non-existent product | `src/qa-scenarios.test.js`: `PUT /api/products/does-not-exist` returns HTTP 404 `{ "error": "Product not found" }` on Express and Worker. | Pass |
| Products administrative UI (`product-management`) | View and manage products on admin page | `src/qa-scenarios.test.js` and `src/brand-qa.test.js`: `/products` loads `/api/products`, `/api/brands`, and `/api/categories` in parallel, renders columns `No`, `Name`, `SKU`, `Brand`, `Category`, `Price`, `Image`, `Quantity`, `Description`, `Status`, `Stock`, `Action` with `brandName` in `Brand`, and supports add, stock, publish, edit, and delete actions. | Pass |
| Products administrative UI (`product-management`) | Edit a product to change its brand | `src/brand-qa.test.js`: Editing `Wireless Mouse` on `/products`, selecting `LG` (`brand-lg`) in the `Brand` dropdown, and saving sends `PUT /api/products/prod-mouse` and updates the row's `Brand` cell to `LG`. | Pass |
| Collapsible Brands checkbox filter before Categories filter (`product-dashboard`) | Render Brands filter section before Categories filter section | `src/brand-qa.test.js`: Left filter panel on `/dashboard` renders collapsible sections in order `Availability`, `Price`, `Brands`, `Categories`, and renders `No brands yet.` when the brand list is empty. | Pass |
| Collapsible Brands checkbox filter before Categories filter (`product-dashboard`) | Filter products by selected brands | `web/src/catalogView.test.js` and `src/brand-qa.test.js`: Checking brand checkboxes filters published products by the OR union of `brandId` (ANDed with availability, price, and category filters), renders removable brand chips before category chips, and updates `<N> items` in memory without refetching. | Pass |
| Collapsible Brands checkbox filter before Categories filter (`product-dashboard`) | No brand selected | `web/src/catalogView.test.js` and `src/brand-qa.test.js`: When `brandIds` is empty, no published product (including products with empty or missing `brandId`) is excluded by the brand filter. | Pass |
| Dashboard route and landing page redirect (`product-dashboard`) | Root URL redirects to dashboard | `src/brand-qa.test.js`: `GET /` responds with HTTP 302 and `Location: /dashboard` on Worker and on Express (when static `web/dist/index.html` does not intercept). | Pass |
| Dashboard route and landing page redirect (`product-dashboard`) | Dashboard page renders two-column layout | `src/brand-qa.test.js`: Navigating to `/dashboard` renders nav menu `Dashboard \| Products \| Brands \| Categories` with `Dashboard` active, fetches `/api/products`, `/api/brands`, and `/api/categories` once on mount in parallel, sets `PAGE_TITLES["/dashboard"]` to `Dashboard`, omits `<h1>`, and renders `.filter-panel` alongside `.product-panel`. | Pass |
| Collapsible Availability filter control (`product-dashboard`) | Activate In Stock Only filter | `web/src/catalogView.test.js` and `src/brand-qa.test.js`: Clicking `In Stock Only` on `/dashboard` sets `aria-pressed="true"`, adds `In Stock Only ×` chip, and excludes `inStock: false` products from the grid and `<N> items`. | Pass |
| Collapsible Availability filter control (`product-dashboard`) | Collapse and expand filter section | `src/brand-qa.test.js`: Clicking the `Brands` section toggle updates `aria-expanded` (`true` -> `false` -> `true`) and toggles `hidden` on `#filter-brand` while preserving active filter selections. | Pass |
| Price range checkboxes and whole-catalog bucket counts (`product-dashboard`) | Filter products by selected price buckets | `web/src/catalogView.test.js` and `src/qa-scenarios.test.js`: Selecting price range checkboxes filters published products by the OR union of selected intervals, adds price chips, and updates `<N> items`. | Pass |
| Price range checkboxes and whole-catalog bucket counts (`product-dashboard`) | Whole-catalog price counts ignore active filters | `web/src/catalogView.test.js` and `src/brand-qa.test.js`: Sidebar price bucket counts remain fixed to all published products when `In Stock Only`, brands, categories, or price ranges are selected. | Pass |
| Result count header and removable active filter chips (`product-dashboard`) | Remove active filter via chip click | `web/src/catalogView.test.js` and `src/brand-qa.test.js`: Clicking `Remove <label>` chips for `In Stock Only`, price range, brand (`Samsung`, `Sony`), and category (`Electronics`) clears only that single filter and updates the grid and `<N> items` in memory without refetching. | Pass |
| Loading, error, empty catalog, and zero-match filter states (`product-dashboard`) | Display API error when product load fails | `src/qa-scenarios.test.js` and `src/brand-qa.test.js`: When `/api/products` or `/api/brands` fails (e.g., HTTP 500 `MONGODB_URI is not set` or `Could not load brands`), `/dashboard` renders `<p class="message error">` instead of an empty catalog state. | Pass |
| Loading, error, empty catalog, and zero-match filter states (`product-dashboard`) | Display zero-match filter message | `src/qa-scenarios.test.js` and `src/brand-qa.test.js`: Selecting a brand with zero published products (`LG`) renders `0 items` and `No products match the selected filters.` while keeping sidebar price counts unchanged. | Pass |

## Commands executed

| Command | Result |
|---|---|
| `npm run workflow:ready -- add-brand-manage qa` | Pass. G1, G2, and G3 approved; all tasks checked; 51 unit/scenario tests passed. |
| `npm test` | Pass. 51 passed, 0 failed (`web/src/catalogView.test.js`, `src/productInput.test.js`, `web/src/productImage.test.js`, `src/qa-scenarios.test.js`). |
| `node --test src/brand-qa.test.js` | Pass. 4 end-to-end scenario suites passed, 0 failed. |
| `npm run build:web` | Pass. Vite built `web/dist/index.html` and assets with 0 errors. |
| `npm run workflow:verify -- add-brand-manage qa` | Pass. `reports/test-report.md` exists and `Overall recommendation` is `PASS`. |

## Defects

| ID | Severity | Scenario | Reproduction steps | Expected | Actual | Status |
|---|---|---|---|---|---|---|
| | | | | | | |

No defects were found.

## Retest results

First QA iteration. No prior defects to retest.

## Known limitations

- Live MongoDB and a live browser session were unavailable (`.env` and `.dev.vars` are absent, and `MONGODB_URI` is unset). Persistence and UI scenarios were executed against the real Express app, Worker `fetch` handler, and React components using an in-memory `MongoClient` stub.
- Existing pre-existing known limitation: when `web/dist/index.html` is present on disk and Express runs in production mode (`dev: false`), `express.static` serves `web/dist/index.html` (HTTP 200) on `GET /` before reaching `app.get("/", ...)` (which redirects with HTTP 302 in dev mode or when `web/dist/index.html` is absent), after which client-side routing `<Route path="/" element={<Navigate to="/dashboard" replace />} />` navigates to `/dashboard`.
- The lightweight React hook test harness prints React key warnings on top-level array children during static markup rendering; component assertions and keys in JSX source are unaffected.

**Overall recommendation:** PASS
