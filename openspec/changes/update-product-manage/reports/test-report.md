# Test Report: update-product-manage

**QA agent:** cursor
**Branch:** feature/update-product-manage
**Iteration:** 1

## Environment and scope

- Node.js on Windows. No `MONGODB_URI` in the process or in `.env`, and `.dev.vars` is absent.
- `src/qa-scenarios.test.js` drives the real Express app and Worker `fetch` handler. `MongoClient.connect` is replaced with an in-memory collection stub for that file only. It is not a live MongoDB server.
- Chrome headless loaded the built app at `/dashboard` and `/products` with no database configured.
- `npm test` also runs the catalog, product-input, and display-src unit tests.

## Scenario coverage

Every scenario in `specs/**/spec.md` appears here.

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Set product image by file upload or URL | Set product image by uploading a valid file | `src/qa-scenarios.test.js` Express, Worker, and the products page. The saved row uses `/api/products/<id>/image?v=`. | Pass |
| Set product image by file upload or URL | Set product image by entering an http or https URL | Same file. The trimmed URL is stored and the image GET is HTTP 404. | Pass |
| Set product image by file upload or URL | Switch product image between uploaded file and URL on edit | Same file. File to URL and URL to file both set `updatedAt`. | Pass |
| Set product image by file upload or URL | Reject invalid uploaded image file or invalid image URL | Same file. SVG, oversized base64, both sources, a bad URL, and an overlong URL return HTTP 400 and do not create a product. | Pass |
| Publish and unpublish a product | Publish a product from the products management page | Same file. Unpublished to published on Express and Worker, and the products page status returns to Published. | Pass |
| Publish and unpublish a product | Unpublish a product from the products management page | Same file. The row stays and shows Unpublished. An omitted `published` on update keeps `false`. The dashboard reload hides it. | Pass |
| Publish and unpublish a product | Attempt to change publish state of a non-existent product | Express and Worker `PUT` for a missing id return HTTP 404 `{ "error": "Product not found" }`. | Pass |
| List products with resolved category names | Fetch products from catalog | Seeded list is HTTP 200, `createdAt` descending, with `categoryName`, `published`, and `imageUrl`. | Pass |
| List products with resolved category names | Seed starter products on first request | Empty collections return Wireless Mouse, Field Guide, and Desk Lamp, each `published: true`. | Pass |
| Create product with validated fields | Create valid product | Express and Worker return HTTP 201 `{ item }` with an id and `createdAt`. | Pass |
| Create product with validated fields | Reject product with missing name or invalid category | HTTP 400 `Name is required`, `Category is required`, and `Category not found`. | Pass |
| Create product with validated fields | Reject product with negative or non-numeric price | HTTP 400 `Price must be a number that is zero or greater`. | Pass |
| Create product with validated fields | Reject product with an invalid image or quantity | HTTP 400 for a bad image and for a quantity that is not a whole number. | Pass |
| Update existing product | Update product fields | Image and publish updates return HTTP 200 `{ item }` with `updatedAt`. | Pass |
| Update existing product | Update non-existent product | HTTP 404 `{ "error": "Product not found" }` on Express and the Worker. | Pass |
| Products administrative UI | View and manage products on admin page | The harness loads `/api/products` and `/api/categories`, shows `24.50`, Status, upload, Publish/Unpublish, and delete. Add to Cart stops at quantity 2. Chrome on the built page also showed Add, Cart, Status, and the missing-URI error. | Pass |
| Display only published products on dashboard | Show published products and hide unpublished products on dashboard | Dashboard reload hides the unpublished draft. `1 items` and price counts use published products only. `npm test` covers the same catalog rules. | Pass |
| Display only published products on dashboard | Unpublishing a product removes it from dashboard on next load | After unpublish, the next dashboard render omits that product from cards, the count, and price counts. | Pass |
| Display only published products on dashboard | Publishing an unpublished product shows it on dashboard on next load | After publish, the next dashboard render includes the product again. | Pass |
| Display only published products on dashboard | Render uploaded or URL product image on dashboard card | The upload path is rendered with `?v=`. An empty image renders the placeholder SVG. `web/src/productImage.test.js` passed. | Pass |
| Price range checkboxes and whole-catalog bucket counts | Filter products by selected price buckets | Selecting `$200 to $299` when only an unpublished product is in that bucket shows `0 items`. | Pass |
| Price range checkboxes and whole-catalog bucket counts | Whole-catalog price counts ignore active filters | Price counts stay on the published catalog when In Stock Only, a color, and a price range are selected. `npm test` passed the same rule. | Pass |
| Loading, error, empty catalog, and zero-match filter states | Display API error when product load fails | Chrome on `/dashboard` showed `MONGODB_URI is not set` in `message error` and did not show `No products yet.` The scenario harness asserts the same error state. | Pass |
| Loading, error, empty catalog, and zero-match filter states | Display empty catalog message when no published products exist | An all-unpublished catalog renders `No products yet.` and `0 items`. | Pass |
| Loading, error, empty catalog, and zero-match filter states | Display zero-match filter message | Header `0 items` and `No products match the selected filters.` Price counts stay unchanged. | Pass |

## Commands executed

| Command | Result |
|---|---|
| `npm run workflow:ready -- update-product-manage qa` | Pass. G3 is approved. |
| `npm test` | Pass. 43 tests, including `src/qa-scenarios.test.js`. |
| `node --test src/qa-scenarios.test.js` | Pass. 9 tests. |
| `npm run build:web` | Pass. |
| Express and Worker with no URI | HTTP 500 `{ "error": "MONGODB_URI is not set" }` |
| Express and Worker body over 2,097,152 bytes | HTTP 413 `{ "error": "Request body is too large" }` |
| Worker invalid JSON | HTTP 400 `{ "error": "Body must be JSON" }` |
| Worker `POST /api/products/abc/image` | HTTP 405 `{ "error": "Method not allowed" }` |
| Express `POST /api/products/abc/image` | HTTP 404 `{ "error": "Not found" }` |
| Chrome headless `/dashboard` and `/products` | Missing-URI error rendered. Products shell showed Add, Cart, and Status. |

## Defects

| ID | Severity | Scenario | Reproduction steps | Expected | Actual | Status |
|---|---|---|---|---|---|---|
| | | | | | | |

No product defect was observed.

## Retest results

First QA pass. No prior defects.

## Known limitations

- Scenario persistence used an in-memory `MongoClient` stub, not a running MongoDB. Create, image bytes, publish, and seed were not repeated against a real server.
- `.dev.vars` is absent, so Wrangler did not boot the Worker. Worker checks used the `fetch` handler directly.
- With `web/dist` present, production Express `GET /` returned HTTP 200 from `express.static` instead of the 302 redirect to `/dashboard`. That route is outside the delta scenarios.
- The scenario renderer prints React warnings about missing keys on the top-level render call. The assertions still passed.

**Overall recommendation:** PASS
