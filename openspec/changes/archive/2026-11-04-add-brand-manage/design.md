# Design

## Context

See `proposal.md` for why this change exists. The approved behavior is the delta specs under `specs/brand-management/spec.md`, `specs/product-management/spec.md`, and `specs/product-dashboard/spec.md`. G1 left five questions for this plan: the sample brand list and when it is inserted, the brand assigned to starter and existing products, whether `brandId` is required, where the Brand column sits, and whether dashboard cards show a brand. Those decisions are recorded below. This document does not change the specs.

Today both runtimes call `src/store.js`. Express maps HTTP in `src/routes/categories.js` and `src/routes/products.js`. The Worker maps the same verbs in `src/worker.js` `handleApi`. Categories live in MongoDB collection `categories` with unique index `category_name_ci` (collation `{ locale: "en", strength: 2 }`). Products live in `products` and store `categoryId` only; `toProduct` fills `categoryName` at read time. `ensureSeed` inserts Electronics, Books, and Home plus `prod-mouse`, `prod-guide`, and `prod-lamp` only when both `categories` and `products` are empty, and it swallows duplicate-key `11000`. `withDatabase` calls `ensureIndexes` and `ensureSeed` on every store operation, then closes the client (`decisions/002`).

The admin UI pattern to copy is `web/src/components/Categories.jsx`: `requestJson`, inline add/edit, `window.confirm` before delete, and errors in `<p className="message error">`. `web/src/App.jsx` renders the nav `Dashboard | Products | Categories` and treats `/products` and `/categories` as `page page-wide` (`max-width: 1600px` in `web/src/index.css`). Express `pagePaths` is `/dashboard`, `/products`, `/categories`. The Worker serves other HTML paths through the ASSETS binding.

`/dashboard` loads `GET /api/products` and `GET /api/categories` once, in parallel. `web/src/catalogView.js` `publishedCatalog` drops `published === false`, then `filterProducts` applies In Stock Only, category ids (OR), and price ranges (OR). Groups combine with AND. An empty selection excludes nothing. `countPriceRanges` uses the published list and ignores filter state. `activeChips` orders availability, then price ranges, then categories. `ProductPanel` chip buttons use `aria-label={`Remove ${chip.label}`}`. Cards show `categoryName` in `.card-collection`. `npm test` runs `web/src/catalogView.test.js` only.

Approved memory is the 2026-11-02 baseline. The source on this branch already includes published, inStock, category filters, and product images. Where that snapshot and the source disagree, this plan follows the source and the approved delta specs. Memory files are left unchanged.

Constraints that shape the approach:

- Express and the Worker must return the same status codes and JSON bodies. Shared validation and seeding stay in `src/store.js`.
- Node 22 ESM. No new npm dependency. No new secret. `MONGODB_URI` stays out of source and `wrangler.toml`.
- The app has no authentication. Brand admin is the same public surface as category admin (`security.md`, KI-003).
- `GET` list endpoints stay unpaginated and ordered by `createdAt` descending. There is no GET-by-id.
- Dashboard filtering stays in the browser. Brand selection does not add a query parameter or a second products fetch.

## Goals / Non-Goals

**Goals:**

- Add a `brands` collection and `/api/brands` CRUD with the same status codes, uniqueness rule, computed `productCount`, and delete guard as categories, on both runtimes.
- Insert a fixed ten-brand sample when the `brands` collection is empty, including on databases that already have categories or products.
- Require `brandId` on product create and update, resolve `brandName` at read time, and assign brands to the three starter products.
- Add `/brands`, order the nav `Dashboard | Products | Brands | Categories`, and add a Brand column and Brand select on `/products` immediately before Category.
- Add a collapsible Brands checkbox filter on `/dashboard` immediately before Categories, with OR matching, AND across groups, and brand chips before category chips.
- Cover the new pure filter and chip rules in `web/src/catalogView.test.js`.

**Non-Goals:**

- Accounts, roles, or a confirmation token on `DELETE`.
- Fetching `https://www.dienmayxanh.com` at runtime, storing logos, or copying retailer marketing text.
- Rewriting existing product documents that have no `brandId`.
- Showing `brandName` on dashboard cards or the featured tile.
- A `brandId` query parameter, server-side dashboard filtering, or pagination.
- Changing price, quantity, image, `published`, or `inStock` rules, the category delete guard, or category `productCount`.
- Closing KI-002 (Express has no 405; invalid JSON text differs) or KI-004 (seed races) or KI-005 (`indexesReady` is process-global).
- Editing `proposal.md`, the delta specs, `.ai/memory/**`, or `approvals.md`.

## Decisions

The five questions in `proposal.md` are decided in this section. Nothing that would change the specs or the task breakdown is left open.

### 1. Seed these ten brands whenever the brands collection is empty

The sample list is fixed. Names are the set named in the proposal. Ids are stable strings, same idea as `cat-electronics`. Descriptions are empty. Nothing in the seed calls the network.

| Id | Name | `createdAt` order |
|---|---|---|
| `brand-samsung` | Samsung | Newest, so `GET /api/brands` returns it first |
| `brand-sony` | Sony | |
| `brand-lg` | LG | |
| `brand-panasonic` | Panasonic | |
| `brand-toshiba` | Toshiba | |
| `brand-apple` | Apple | |
| `brand-electrolux` | Electrolux | |
| `brand-daikin` | Daikin | |
| `brand-sharp` | Sharp | |
| `brand-casper` | Casper | Oldest |

Insert timestamps one second apart so `createdAt` descending is exactly this table order even when the clock would otherwise tie. `toBrand` still returns `description: ""`.

`ensureBrandSeed` runs at the start of `ensureSeed`, which `withDatabase` already calls for every store operation. It inserts the ten documents only when `brands.countDocuments()` is 0. A duplicate-key `11000` is swallowed. Any other error is rethrown. A database that already has categories and products, and an empty `brands` collection, therefore gains the sample brands on the next `GET /api/brands`, `GET /api/products`, or `GET /api/categories`. It does not gain a second copy of the starter products.

The full starter catalog is unchanged in its gate: categories and products are inserted only when both of those collections are empty. That path now also requires the brand seed to have run first, so a completely empty database satisfies the product spec scenario in one request.

**Alternatives considered:**

| Alternative | Why it was rejected |
|---|---|
| Seed brands only when categories and products are also empty | An existing catalog would never receive brands. `/brands` would stay empty and product save would have no brand to select. The brand spec scenario is "when brand catalog is empty", and it includes any catalog request that already triggers seeding. |
| Fetch the live Dien May Xanh brand filter | Adds an outbound request, a parser, and a failure mode. The approved examples are already a closed list. No secret or new dependency is available for that call. |
| Store scraped descriptions or logos | Copies retailer content into MongoDB and adds an image pipeline this change does not need. |

### 2. Starter products reference Samsung, Sony, and Panasonic; existing rows are not rewritten

When the starter products are inserted, resolve each brand with `findBrandByName` (the same collation as the unique index):

| Product id | Brand name | Id after the sample seed |
|---|---|---|
| `prod-mouse` | Samsung | `brand-samsung` |
| `prod-guide` | Sony | `brand-sony` |
| `prod-lamp` | Panasonic | `brand-panasonic` |

Field Guide stays in Books. Sony is only a valid brand reference so the three starter rows are not all Samsung and the dashboard filter has three brands to exercise. It is not a claim that the retailer sells that SKU.

If the named brand is missing because the collection was already non-empty, use the newest brand (`createdAt` descending), which is the same row the add form treats as the first brand. If the collection has no documents after the brand-seed attempt, skip the category and product inserts and return. The database stays empty so a later request can try again. Do not insert a product with an empty `brandId`.

Documents already stored without `brandId` are left as they are. `toProduct` returns `brandId: ""` and `brandName: ""` when the field is missing or the brand document is gone. List, create, and update do not run an update that backfills old rows.

**Alternatives considered:**

| Alternative | Why it was rejected |
|---|---|
| Assign every existing product to Samsung during seed | The list contract allows a missing brand to come back as `""`. A silent rewrite would change rows an administrator had not edited and would hide the legacy state. |
| Give all three starter products Samsung | A fresh dashboard would have only one brand in use, so the new OR filter would not be visible on sample data. |
| Leave starter products without a brand | The product spec requires valid brand assignments on the seeded starter products. |

### 3. `brandId` is required on create and update, same as `categoryId`

`POST /api/products` and `PUT /api/products/:id` both require a trimmed `brandId` that matches an existing brand `_id`.

| Input | Status | Body |
|---|---|---|
| Missing, empty, or whitespace `brandId` | 400 | `{ "error": "Brand is required" }` |
| Non-empty `brandId` that matches no brand | 400 | `{ "error": "Brand not found" }` |
| Existing brand id | Continue with the current category, price, quantity, image, `published`, and `inStock` rules | |

Check order on create: name, then brand (required, then exists), then category (required, then exists), then the existing price, quantity, image, `published`, and `inStock` checks. On update, a missing product is still HTTP 404 `"Product not found"` before any field check. Renaming a brand does not rewrite product documents. `brandName` is resolved in `toProduct` the same way `categoryName` is.

The products page follows the category control:

- Add sets `brandId` to `brands[0].id`, or `""` when the list is empty. After the sample seed, that first row is Samsung.
- Edit sets `brandId` to `item.brandId` or `""`. It does not substitute the first brand.
- Save sends `brandId`. The client rejects a blank value with `"Brand is required"` before the request, placed immediately after the name check and before the category check.
- Stock and publish toggles add `brandId: item.brandId ?? ""` and otherwise send the same JSON they send today. A legacy row with no brand gets HTTP 400 `"Brand is required"`. The page shows that string in `.message.error` and leaves the row unchanged. The toggle does not invent a brand. The administrator assigns one by editing and saving.

**Alternatives considered:**

| Alternative | Why it was rejected |
|---|---|
| Allow a product to be saved with no brand | The approved scenarios require `"Brand is required"` and `"Brand not found"` on both `POST` and `PUT`. |
| On update, keep a missing `brandId` the way omitted `inStock` is kept | A blank brand would then succeed, which contradicts those 400 scenarios. Omitted `published` and `inStock` stay on the keep path. |
| Make a stock or publish click assign `brands[0]` | That would persist a brand the administrator did not choose. Edit remains the place a legacy row gains a brand. |

### 4. Brand sits immediately before Category on `/products`

Table header and row order:

`No`, `Name`, `SKU`, `Brand`, `Category`, `Price`, `Image`, `Quantity`, `Description`, `Status`, `Stock`, `Action`

The Brand cell shows `brandName`. The empty catalog row uses `colSpan={12}`. The form's Brand `<select>` is the label immediately before Category. An empty brand list uses `<option value="">No brands</option>`, matching `No categories`.

`web/src/index.css` gives `.product-table .col-brand` the same `140px` width as `.col-category`, and raises `.product-table` `min-width` from `1396px` to `1536px` so the extra column fits inside the existing `1600px` page.

**Alternatives considered:**

| Alternative | Why it was rejected |
|---|---|
| Place Brand after Category | The approved products UI requirement lists Brand before Category, in the same order as the nav and the dashboard filters. |

### 5. Dashboard cards keep showing `categoryName` only

`web/src/components/ProductPanel.jsx` stays as it is. Brand appears in the filter section and in chips. Cards and the featured tile do not gain a brand line.

The filter is client-side:

- `createFilterState` adds `brandIds: []` and `collapsed.brand: false` (expanded, same as category).
- `filterProducts` treats a missing or empty `brandIds` as no brand constraint. A non-empty set keeps products whose `brandId` is in the set (OR). A product with a missing `brandId` fails that set. In Stock Only, brand, category, and price still combine with AND. `filterProducts` still does not read `published`. `viewCatalog` still runs `publishedCatalog` first, so the grid only considers published products.
- `countPriceRanges` continues to ignore filter state. Brand checkboxes have no counts. Category checkboxes stay without counts.
- `activeChips(state, categories = [], brands = [])` inserts brand chips after price chips and before category chips. Labels come from the brands array order, then any selected id that was not in that array uses the raw id as the label (same fallback categories already use). `clearChip` for `kind: "brand"` removes only that id.
- `viewCatalog(products, state, categories = [], brands = [])` passes brands into `activeChips`. Existing three-argument calls keep working.
- `FilterPanel` renders a `FilterSection` with `id="brand"`, title `Brands`, after Price and before Categories. Zero brands shows `No brands yet.` The checkboxes match the category rows and do not show a count.
- `Dashboard` fetches `GET /api/products`, `GET /api/brands`, and `GET /api/categories` with `Promise.all`. A failure of any one of them sets the existing error status. The brands call uses fallback `"Could not load brands"`. Filter toggles stay in memory and do not refetch. Heart and `BUY NOW` stay local.

`GET /` remains HTTP 302 `Location: /dashboard` on both hosts. Unknown client routes still navigate to `/dashboard`.

**Alternatives considered:**

| Alternative | Why it was rejected |
|---|---|
| Print `brandName` above the product name | The dashboard spec adds the filter, the chips, and the nav. It does not add card text. `ProductPanel.jsx` is outside the proposal's file impact. |
| Filter brands on the server | Category and price filters already run in `catalogView.js`, which is what `npm test` covers. A query parameter would be a second contract and a second fetch. |

### 6. Brand CRUD copies the category module

New store functions, all using `withDatabase`:

| Function | Behavior |
|---|---|
| `listBrands` | All brands, `createdAt` descending. `productCount` is the number of products whose `brandId` equals that `_id`. The count is not stored. |
| `addBrand` | Trimmed required `name`, trimmed optional `description`, UUID `_id`, `createdAt`. Pre-check plus unique index. Success returns `productCount: 0`. |
| `updateBrand` | 404 `"Brand not found"` when the id is missing. Same name rules, excluding the current id. Sets `updatedAt`. Returns the current `productCount`. Keeping or only changing the case of the brand's own name succeeds. |
| `deleteBrand` | 404 when missing. 409 `"Move or delete products in this brand first"` when any product has that `brandId`. Otherwise delete and return `{ "deleted": true }`. |

`findBrandByName(brands, name, exceptId)` uses `nameCollation`. `ensureIndexes` creates `brand_name_ci` on `brands.name` with that collation and `{ unique: true }` before it sets `indexesReady`. If index creation throws, the flag stays false so the next call retries.

`rethrowDuplicate(error, message)` takes the conflict message. Category catch sites pass `"A category with that name already exists"`. Brand catch sites pass `"A brand with that name already exists"`. The pre-check throws that same brand string before the write. The index remains the race backstop.

There is no `GET /api/brands/:id`.

**Alternatives considered:**

| Alternative | Why it was rejected |
|---|---|
| Store `productCount` on the brand document | Category counts are computed at read time. A stored count would drift when products are created or deleted. |
| Reuse the category collection with a `kind` field | Brands and categories have independent delete guards and name indexes. Mixing them would change category uniqueness. |
| Leave `rethrowDuplicate` hardcoded to the category sentence | A brand unique-index race would return the category error text. |

## Data model and API contracts

### Brand document (`brands`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Mongo `_id`. Sample rows use the `brand-*` ids above. Created rows use `crypto.randomUUID()`. |
| `name` | string | yes | Trimmed, non-empty. Unique under `{ locale: "en", strength: 2 }`. |
| `description` | string | no | Trimmed. Missing documents read back as `""`. |
| `createdAt` | string | yes | ISO timestamp. |
| `updatedAt` | string | no | Set on update. Omitted from JSON when absent. |
| `productCount` | number | response only | Products with this `brandId`. Not stored. |

### Product document changes

Add stored `brandId` (string). API list and item objects add `brandId` and `brandName` beside the existing category fields. `brandName` is `""` when the brand cannot be resolved. The rest of the product JSON stays as `toProduct` returns it today, including `published`, `inStock`, and `imageUrl`.

### `GET /api/brands`

`200 { "items": [ ... ] }` ordered by `createdAt` descending. Item fields: `id`, `name`, `description`, `createdAt`, optional `updatedAt`, `productCount`.

### `POST /api/brands`

Body: `name`, optional `description`. `201 { "item": { ... } }` with `productCount: 0`. `400 { "error": "Name is required" }`. `409 { "error": "A brand with that name already exists" }`.

### `PUT /api/brands/:id`

Same body as create. `200 { "item": { ... } }` including the current `productCount` and `updatedAt`. `400` for a blank name. `404 { "error": "Brand not found" }`. `409` for a name that belongs to a different brand.

### `DELETE /api/brands/:id`

`200 { "deleted": true }`. `404 { "error": "Brand not found" }`. `409 { "error": "Move or delete products in this brand first" }`.

### Product writes

`POST /api/products` still returns `201 { "item" }`. `PUT /api/products/:id` still returns `200 { "item" }` or `404 { "error": "Product not found" }`. Both require `brandId` as in decision 3. `GET /api/products` items include `brandId` and `brandName`. `DELETE /api/products/:id` is unchanged; the brand's `productCount` falls on the next list because it is computed.

### Pages

| Path | Change |
|---|---|
| `/brands` | New admin page. `document.title` and `<h1>` are `Brands`. Width up to 1600px. |
| `/dashboard`, `/products`, `/categories` | Nav order becomes `Dashboard \| Products \| Brands \| Categories`. |
| `/` | Unchanged 302 to `/dashboard`. |

Express and the Worker share one JSON contract. Missing `MONGODB_URI` stays HTTP 500 `{ "error": "MONGODB_URI is not set" }`. Other 500 messages stay `{ "error": "Request failed" }`.

## Express and Worker parity

| Piece | Express | Worker |
|---|---|---|
| Brand CRUD | New `src/routes/brands.js`, mounted at `/api/brands` in `src/app.js` | New `^/api/brands(?:/([^/]+))?$` branch in `handleApi`, after the category branch. `decodeURIComponent` the id. |
| Status and JSON | Store errors pass through `apiError` | The same store errors pass through `errorResponse` |
| Collection `GET` with an id, and other extra methods | No new 405 handler. Unmatched methods stay on the current Express fall-through (KI-002). | 405 `{ "error": "Method not allowed" }`, matching categories |
| `OPTIONS /api/*` | Unchanged | Unchanged 204 |
| `GET /brands` HTML | Add `/brands` to `pagePaths` | Existing ASSETS fetch. Do not add an HTML route. Express has no SPA fallback for unknown paths, so the page path has to be listed there. |
| Invalid JSON | Unchanged `express.json()` path | Unchanged 400 `"Body must be JSON"` |

Do not edit `wrangler.toml`. Do not add a Worker secret.

## Security

- Brand names, descriptions, and `brandId` are validated in `src/store.js`. The browser checks are hints. The server remains the authority.
- Names and descriptions render as React text. Do not add `dangerouslySetInnerHTML`.
- The new routes stay unauthenticated, on purpose, matching categories (KI-003).
- Delete confirmation is `window.confirm(\`Delete ${name}?\`)` only. The API does not require a token.
- The sample list is hardcoded. The implementation does not request `dienmayxanh.com`.
- No connection string is written into source, `README.md`, OpenSpec, or `wrangler.toml`.

## Performance

- `listBrands` loads every brand and every product `brandId`, the same shape as `listCategories`. The catalog is already unpaginated.
- `listProducts`, `addProduct`, and `updateProduct` each add one `brands` query inside the existing per-request client. There is no cached client and no new index beyond `brand_name_ci`.
- `/dashboard` adds one parallel `GET /api/brands` on mount. Checkbox changes do not call the API.
- `indexesReady` still skips index creation after the first success in that isolate (KI-005). A process that started on older code needs a restart before it will create `brand_name_ci`. A process that starts on this code creates the category index and the brand index before setting the flag.

## Risks / Trade-offs

- [Existing products have no `brandId`, so stock and publish toggles return 400 until the row is edited] → The page shows `"Brand is required"` and does not write a guessed brand. Read still returns the row with empty `brandId` and `brandName`.
- [A deployment that already has products gets sample brands with `productCount` 0] → Expected. Brand seed does not attach those brands to old products. Administrators assign brands from `/products`.
- [Two first requests can both see an empty `brands` collection] → Swallow `11000`, same as category seed (KI-004). Do not add a transaction.
- [An isolate that already set `indexesReady` will not create `brand_name_ci` until restart] → Create the index in the same `ensureIndexes` function, before the flag. Accept KI-005 for an already-warm process.
- [Express `GET /brands` 404s if `pagePaths` is forgotten, while the Worker still serves the SPA] → The page task updates `pagePaths` and `App.jsx` together.
- [`npm test` does not execute Mongo, Express, or the Worker] → Pure filter and chip rules are unit-tested. HTTP status codes are checked by reading the route next to `handleApi`, then by the manual pass in the verification group when `MONGODB_URI` is available.

## Migration Plan

Deploy is a code deploy of Express and the Worker. No `wrangler.toml` change and no new secret. The first API call against an empty `brands` collection inserts the ten sample brands. Existing product documents remain readable.

Rollback is reverting the application code. Leftover `brands` documents and leftover `brandId` fields are ignored by the previous `toProduct`, which copies a fixed field list. No down-migration script runs. Sample brands can stay in MongoDB after rollback.

## Requirement mapping

Each scenario under a requirement is implemented by the same tasks as that requirement.

| Spec requirement | Tasks |
|---|---|
| brand-management: List brands with product counts, including the empty-catalog seed scenario | 1.2, 1.4, 2.1, 2.3 |
| brand-management: Create brand with unique case-insensitive name | 1.1, 1.4, 2.1, 2.3 |
| brand-management: Update existing brand | 1.1, 1.4, 2.1, 2.3 |
| brand-management: Delete empty brand only | 1.4, 2.1, 2.3 |
| brand-management: Brands administrative UI and navigation order | 2.2, 3.1, 3.2 |
| product-management: Assign and validate product brand | 1.5, 4.2, 4.3 |
| product-management: List products with resolved category names, now including `brandId` and `brandName`, and the starter-seed scenario | 1.2, 1.3, 1.5 |
| product-management: Create product with validated fields | 1.5, 4.2 |
| product-management: Update existing product | 1.5, 4.3 |
| product-management: Products administrative UI | 3.2, 4.1, 4.2, 4.3 |
| product-dashboard: Collapsible Brands checkbox filter before Categories | 5.1, 5.2, 5.3, 5.4 |
| product-dashboard: Dashboard route and landing page redirect | 3.2, 6.3 |
| product-dashboard: Collapsible Availability filter control, now including the Brands section | 5.3 |
| product-dashboard: Price range checkboxes and whole-catalog bucket counts | 5.1, 5.2 |
| product-dashboard: Result count header and removable active filter chips | 5.1, 5.2, 5.4 |
| product-dashboard: Loading, error, empty catalog, and zero-match filter states | 5.4, 6.2 |

Price, image, quantity, `published`, and `inStock` scenarios in the modified product requirements stay in force because task 1.5 does not change those validators. The zero-match and empty-catalog sentences stay in `ProductPanel.jsx`, which task 5.4 leaves unchanged. `GET /` stays a 302 because task 6.3 checks that both hosts still redirect.
