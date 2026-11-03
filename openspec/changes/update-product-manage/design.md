# Design

## Context

See `proposal.md` for why this change exists. The approved behavior is the delta specs under `specs/product-management/spec.md` and `specs/product-dashboard/spec.md`. G1 left five questions for this plan: upload storage, allowed image types, upload size versus the 2048-character `imageUrl` cap, the default publish state, and the dashboard message when nothing is published. Those decisions are recorded below. This document does not change the specs.

Today both runtimes call `src/store.js`. Express maps HTTP in `src/routes/products.js` after `express.json()` in `src/app.js`. The Worker maps the same verbs in `src/worker.js` `handleApi`. Product documents store `imageUrl` as `""` or an `http`/`https` string of at most 2048 characters (`optionalImageUrl`). There is no `published` field. `GET /api/products` returns every product, and `web/src/catalogView.js` `viewCatalog` filters only by price. `ProductPanel` shows `No products yet.` when `fetchedCount` is 0 and `{view.count} items` from the filtered list. The admin form in `web/src/components/Products.jsx` sends JSON and has a single URL input. `npm test` runs `web/src/catalogView.test.js` only. There is no object-storage binding in `wrangler.toml`. `MONGODB_URI` stays in the environment.

Constraints that shape the approach:

- Express and the Worker must keep the same status codes and JSON error bodies for this feature. Shared rules belong in one module both adapters already call.
- The Worker has no durable local disk. A new secret or an R2 binding would make the Express path a different implementation.
- `GET /api/products` is unpaginated and is loaded in full by `/products` and `/dashboard`. Image bytes cannot ride along on every list item.
- MongoDB documents must stay under the 16 MB BSON limit. Validation must finish before a write.
- No new npm dependency. Node 22 ESM, the `mongodb` driver already in the root package, and `nodejs_compat` on the Worker are enough.
- The app has no authentication. Publish state is storefront visibility, not an authorization check.

## Goals / Non-Goals

**Goals:**

- Accept a product image as an uploaded file or as an `http`/`https` URL, and persist that choice identically on Express and the Worker.
- Serve uploaded bytes from MongoDB at a stable same-origin path stored in `imageUrl`, leaving the 2048-character cap on external URLs only.
- Add a boolean `published` field, default existing rows, starter products, and omitted creates to published, and let `/products` publish or unpublish through the existing `PUT`.
- Limit dashboard membership, cards, `<N> items`, and price-bucket counts to published products, and show `No products yet.` plus `0 items` when that set is empty.
- Add a boolean `inStock` field with the same default rules as `published`, show it on `/products`, and make `In Stock Only` on `/dashboard` exclude `inStock: false`.
- Replace the dashboard Color swatches with a Categories filter, drop the Weight sorts, and render every matched product as the same standard card.
- Remove the admin cart, use shared icon buttons for row actions, and widen `/products` and `/categories` to 1600px.
- Cover the new pure rules with `node:test`.

**Non-Goals:**

- Accounts, roles, or hiding `PUT` from anonymous callers.
- A new publish-only or stock-only route, a `published` or `inStock` query parameter, or server-side dashboard filtering.
- Changing category `productCount` or the category delete guard.
- Deriving `inStock` from `quantity`.
- Closing the existing Express versus Worker gaps for unsupported methods (KI-002) or invalid JSON message text.
- Pagination, image transformation, SVG sanitizing, or a CDN.
- Editing `proposal.md`, the delta specs, `.ai/memory/**`, or `approvals.md`.

## Decisions

### 1. Store uploads in MongoDB and keep `imageUrl` as a short reference

Uploaded bytes go in a `productImages` collection, one document per product id. The product document stores a reference, never the bytes and never a `data:` URL.

| `imageUrl` stored on the product | Meaning |
|---|---|
| `""` | No image. UI shows the existing placeholder. |
| `http:` or `https:` URL, trimmed, length ≤ 2048 | Browser loads that URL directly. The server does not fetch it. |
| `/api/products/{id}/image` | Bytes live in `productImages` under `_id` equal to the product id. `uploadImagePath(id)` is `/api/products/` plus `encodeURIComponent(id)` plus `/image`. |

`GET /api/products/:id/image` returns the raw bytes. List and item JSON stay small. The same Mongo database is already required on both runtimes, so the behavior matches without a new secret. `MONGODB_URI` remains outside source and `wrangler.toml`.

The admin UI and `PUT` body round-trip an upload by sending that path back as `imageUrl` with no `imageFile`. The server accepts the path only on update, and only when it equals both `uploadImagePath(id)` and the document's current `imageUrl`. Any other non-URL, including another product's path or the same path on create, is HTTP 400 `"Image must be an http or https URL"`. Clearing sends `imageUrl: ""` and deletes the image document. A new `http`/`https` URL replaces the file and deletes the image document.

**Alternatives considered:**

| Alternative | Why it was rejected |
|---|---|
| `data:` URL inside `imageUrl` | A useful file exceeds 2048 characters. Every list response would carry the bytes. The current Express JSON limit is 100 KB. |
| File on local disk or under `web/dist` | The Worker has no durable disk. Express and the Worker would diverge. |
| Cloudflare R2 or another object store | R2 is Worker-only. Express would need a second credential and a separate client. No R2 binding exists, and this change adds no secret. |
| GridFS | Also Mongo-backed, but the 1 MB cap fits in one BSON document. GridFS adds cursors and extra collections for no gain. |
| `multipart/form-data` | Express would need a new parser. The Worker would use `FormData`. Two parsers can drift. The API is already JSON. |

### 2. Allow PNG, JPEG, WebP, and GIF, checked by magic bytes

Declared `contentType` and the decoded prefix must both be one of these. The stored and served type is the canonical value, not the filename.

| Canonical type | Signature |
|---|---|
| `image/png` | `89 50 4E 47 0D 0A 1A 0A` |
| `image/jpeg` | `FF D8 FF` |
| `image/gif` | `GIF87a` or `GIF89a` |
| `image/webp` | `RIFF` at offset 0 and `WEBP` at offset 8 |

`image/jpg` is not accepted. SVG, BMP, AVIF, HEIC, and any mismatched type are rejected with HTTP 400 `"Image file must be PNG, JPEG, WebP, or GIF"`. The file input `accept` list is `image/png,image/jpeg,image/webp,image/gif`. The browser `file.type` is a client hint. The server still checks the bytes.

SVG is rejected because the file is served from this origin. The app has no HTML sanitizer (`security.md`). An SVG opened directly can carry script. GIF may be animated. The server does not decode past the signature, so a short signature-only payload is a valid type check. If the browser cannot paint it, the existing image `onError` path shows the placeholder.

### 3. Cap uploads at 1 MB and leave the URL cap at 2048

| Limit | Value | Error |
|---|---|---|
| Decoded image | 1,048,576 bytes | `"Image file must be 1 MB or smaller"` |
| `dataBase64` length | 1,398,104 characters (`4 * ceil(1048576 / 3)`) | same size error, before decode |
| External `imageUrl` | 2048 characters | `"Image URL is too long"` (unchanged) |
| JSON body on both runtimes | 2,097,152 bytes (`2mb` in Express) | HTTP 413 `"Request body is too large"` |

A 1 MB file encodes to about 1.4 MB of base64 plus a small JSON wrapper, which fits in the 2 MB body. The upload does not consume the 2048-character budget. The stored upload path is a short ASCII string. Empty decoded bytes are HTTP 400 `"Image file is empty"`. A `dataBase64` value that is not standard base64 (alphabet, length multiple of 4, padding only at the end, no whitespace, no `data:` prefix) or an `imageFile` that is not a plain object with string fields is HTTP 400 `"Image file is invalid"`.

When `imageFile` is present and trimmed `imageUrl` is also non-empty, the response is HTTP 400 `"Choose an image file or an image URL, not both"`. The UI clears the other control when the admin picks a file or types a URL. The server remains the authority.

`imageFile` omitted or `null` means no file. Combined with an empty or omitted `imageUrl`, the product has no image. On create that stores `""`. On update that clears a previous file or URL, except for the upload-path round-trip in decision 1.

**Alternatives considered:**

| Alternative | Why it was rejected |
|---|---|
| Keep the 100 KB Express default as the file cap | Product photos are routinely larger, and base64 would still require a higher JSON limit. |
| 5 MB or more | Pushes the `productImages` document toward the 16 MB BSON ceiling and makes each image GET heavy on the Worker. |
| Raise the 2048 cap and store base64 in `imageUrl` | Ties a URL rule to file size and returns bytes on every catalog row. KI-008 stays as it is: the 2048 cap remains code and this design, and it is still absent from the main spec text. This plan does not edit that spec. |

### 4. Default publish state is published, except an explicit `false`

`published` is a boolean on the product. Only strict boolean `false` means unpublished.

| Case | Result |
|---|---|
| Existing document with no `published` field, or any stored value other than boolean `false` | `toProduct` returns `published: true`. No migration script. The next successful update writes a real boolean. |
| Starter products inserted by `ensureSeed` | `published: true` and `inStock: true` on `prod-mouse`, `prod-guide`, and `prod-lamp`. Their `imageUrl` stays `""`. |
| `POST` with `published` omitted | Store `true`. A new product stays visible, which matches the catalog before this change. |
| `PUT` with `published` omitted | Keep the current value. A missing current value counts as `true`. |
| `published: true` or `published: false` | Store that boolean. |
| `null`, numbers, or strings such as `"false"` | HTTP 400 `"Published must be true or false"`. |

`/products` shows every product. A checkbox labeled `Published` defaults to checked on add. A row icon button named `Publish` or `Unpublish` sends `PUT` with the current fields, the flipped boolean, the current `imageUrl`, and no `imageFile`. There is no second route. A missing id still returns HTTP 404 `"Product not found"` before any write.

**Alternatives considered:**

| Alternative | Why it was rejected |
|---|---|
| Default missing rows and starter products to unpublished | The current dashboard shows every stored product. A fresh seed and every existing database would show an empty storefront until someone republishes them. |
| A one-time migration that writes `published: true` | The read default already does that. Both runtimes share `toProduct`. A batch job would need a second entry point. |
| Omitted `published` on create means `false` | New products would disappear from the storefront unless the client remembers the flag. |
| Omitted `published` on update means `true` | A client that updates another field and leaves the flag out would republish a draft. The open question asks about new products, existing rows, and seed rows. |

### 5. An empty published catalog uses the approved empty copy

When `GET /api/products` succeeds and zero products are published, `/dashboard` shows `No products yet.` and `0 items`. That includes a database that has only unpublished products. The approved dashboard scenario already requires this copy. This plan does not add a second sentence such as "No published products."

`viewCatalog` applies `publishedCatalog` before stock, category, and price filtering, sorting, and `countPriceRanges`. It returns `catalogCount` as the published length and `count` as the length after filters. It still returns `featured` and `cards`, but `ProductPanel` renders every entry of `items` as the same standard card. `ProductPanel` uses `catalogCount === 0` for `No products yet.` and `catalogCount > 0 && count === 0` for `No products match the selected filters.` The header stays `{count} items`. `filterProducts` does not read `published`. `Dashboard` still fetches the full product list once and passes it through. It does not use `items.length` to choose the empty message, because unpublished rows would otherwise turn this state into the zero-match sentence.

The admin table keeps its own `No products yet.` row only when the API returns zero documents. Unpublished products remain in that table.

### 6. Shared pure module, then the store, then both adapters

`src/productInput.js` owns the pure rules: `uploadImagePath`, `parsePublished`, `parseInStock`, `resolveProductImage`, and the byte, URL, and size constants. It imports neither `mongodb` nor `src/store.js`. It throws `Error` with `.status` set. `src/store.js` calls it and is the only writer. Express and the Worker keep mapping status and bodies. They do not reimplement magic bytes or publish and stock defaults.

`resolveProductImage(input, context)` returns one of:

| `kind` | When | `imageUrl` | Bytes |
|---|---|---|---|
| `empty` | No file and no URL | `""` | none |
| `external` | No file and an `http`/`https` URL | trimmed URL | none |
| `upload` | File present and URL empty | `uploadImagePath(context.id)` | `Uint8Array` plus canonical `contentType` |
| `keep` | Update only, no file, and `imageUrl` equals the current upload path for this id | that path | none |

`context.currentImageUrl` is set only by update. Create never returns `keep`.

JSON shape for create and update:

```json
{
  "name": "Desk Lamp",
  "sku": "HM-220",
  "price": 39,
  "categoryId": "cat-home",
  "description": "Adjustable LED lamp",
  "quantity": 5,
  "published": true,
  "inStock": true,
  "imageUrl": "",
  "imageFile": {
    "contentType": "image/png",
    "dataBase64": "<standard base64>"
  }
}
```

`imageFile` is omitted or `null` when the admin is not uploading. The browser builds `dataBase64` with a loop and `btoa`. No new package. `inStock` is optional on both create and update and follows decision 7.

Display URLs are separate from stored URLs. `web/src/productImage.js` `displayImageSrc(url, version)` appends `?v=` plus `encodeURIComponent(version)` only when `url` matches `^/api/products/[^/]+/image$`. External URLs are returned unchanged, because a query could break a signed URL. The form and the `PUT` body use the stored path with no query. `version` is `updatedAt` or, when that is absent, `createdAt`, so replacing a file changes the DOM URL after save. `GET` ignores the query string.

### 7. Stock status, dashboard filters, and admin actions

`inStock` follows the same rules as `published`, through `parseInStock` in `src/productInput.js`. `src/store.js` applies it, so Express and the Worker share it.

| Case | Result |
|---|---|
| Stored document with no `inStock`, or any value other than boolean `false` | `toProduct` returns `inStock: true` |
| `POST` with `inStock` omitted | Store `true` |
| `PUT` with `inStock` omitted | Keep the current value. `false` only when the stored value is boolean `false`. |
| `inStock: true` or `false` | Store that boolean |
| Any other present value, including `null` and `"false"` | HTTP 400 `"Stock status must be true or false"` |

`inStock` is a manual flag. It does not read `quantity`.

Dashboard rules in `web/src/catalogView.js`:

- `SORT_OPTIONS` is `Best Sellers`, `Newest`, `Price:High-Low`, and `Price:Low-High`. `Best Sellers` keeps fetched order.
- `In Stock Only` excludes `inStock === false` through `productIsInStock`.
- The Color swatches are removed. `Dashboard` loads `GET /api/categories` alongside `GET /api/products`, and `FilterPanel` renders a collapsible `Categories` section with one checkbox per category. Selected categories combine with OR on `categoryId`. No selection does not exclude products.
- Chips follow availability, then price ranges, then categories. Category chips use the category name.
- `countPriceRanges` runs on the published list, so price counts ignore availability, category, and the selected price ranges.
- Every matched product renders through the same `ProductCard`: square image well, category, name, price, heart, and `BUY NOW`. There is no featured caption tile.

Admin pages:

- `/products` has no cart and no `Add to Cart`.
- Row actions on `/products` are icon buttons from `web/src/components/ActionIcon.jsx`, each with an `aria-label` and `title`: `Mark in stock` or `Mark out of stock`, `Publish` or `Unpublish`, `Edit`, and `Delete`. The stock button sends `PUT` with the flipped `inStock`, the current fields, the current `imageUrl`, and no `imageFile`.
- The product table adds a `Stock` column that reads `Out of Stock` when `inStock === false` and `In Stock` otherwise. The empty row spans 11 columns.
- `/categories` uses the same pencil and trash icons, named `Edit` and `Delete`, in a 112px action column. Delete still asks `window.confirm`.
- `App.jsx` gives `/products` and `/categories` the `page page-wide` class, which sets `max-width: 1600px`. `/dashboard` keeps `page page-dashboard` and full width.

## Data model

Collection `products`, in addition to the current fields:

| Field | Type | Required | Notes |
|---|---|---|---|
| `published` | boolean | on write | See decision 4. Read of a missing field is `true`. |
| `inStock` | boolean | on write | See decision 7. Read of a missing field is `true`. |
| `imageUrl` | string | yes | `""`, external URL, or `uploadImagePath(id)`. |

No new product index. `published` and `inStock` are not queried in Mongo. Category `productCount` and the delete guard still count every product that references the category, published or not.

Collection `productImages`:

| Field | Type | Notes |
|---|---|---|
| `_id` | string | Product id. Primary key. No extra index. |
| `contentType` | string | One of the four canonical types. |
| `size` | number | Decoded byte length. |
| `data` | `Binary` from `mongodb` | Raw bytes. Not base64. |
| `createdAt` | string | ISO time on first insert. |
| `updatedAt` | string | ISO time on replace. |

`GET /api/products` does not join this collection. `toProduct` adds `published` and `inStock` and still returns `imageUrl: doc.imageUrl ?? ""`. Quantity missing on old documents stays `0`.

Write order, without a multi-document transaction (the store opens one short-lived client per call, ADR-002):

1. Validate in memory, including bytes, before any image or product write.
2. For `upload`, upsert `productImages` first. On create, if the following product insert throws, delete that image document and rethrow. On update, keep the previous image document in memory and write it back if the product update throws.
3. For `empty` or `external`, update the product first, then delete `productImages`. A failed delete can leave an orphan document. The next upload upserts the same `_id`. The UI does not request the blob once `imageUrl` no longer points at it.
4. For `keep`, do not write `productImages`.
5. `deleteProduct` deletes the image document only after the product delete succeeds. A missing product stays HTTP 404 and does not remove an image document.

Seed rows gain `published: true` and `inStock: true`. No image documents are seeded. `ensureSeed` still runs only when both `categories` and `products` are empty.

## API contracts

Item fields gain `published` and `inStock`. Existing fields stay. Create remains HTTP 201 `{ "item": ... }`. Update remains HTTP 200 `{ "item": ... }` with `updatedAt`. Delete remains HTTP 200 `{ "deleted": true }`. List remains HTTP 200 `{ "items": ... }` in `createdAt` descending order and includes unpublished products.

`GET /api/products/:id/image`

| Outcome | Status | Body |
|---|---|---|
| Image document exists | 200 | Raw bytes. `Content-Type` is the stored type. `X-Content-Type-Options: nosniff`. `Cache-Control: no-store`. |
| No image document | 404 | `{ "error": "Product image not found" }` |

There is still no `GET /api/products/:id` JSON resource. The image path is the only new path.

Error text added by this change, all `{ "error": "<message>" }` unless noted:

| Condition | Status | Message |
|---|---|---|
| File and non-empty URL together | 400 | `Choose an image file or an image URL, not both` |
| Bad `imageFile` shape or bad base64 | 400 | `Image file is invalid` |
| Zero decoded bytes | 400 | `Image file is empty` |
| Wrong or mismatched type, including SVG | 400 | `Image file must be PNG, JPEG, WebP, or GIF` |
| Decoded file or base64 length over the cap | 400 | `Image file must be 1 MB or smaller` |
| `published` present and not a boolean | 400 | `Published must be true or false` |
| `inStock` present and not a boolean | 400 | `Stock status must be true or false` |
| JSON body over 2,097,152 bytes | 413 | `Request body is too large` |

Unchanged messages stay the authority for name, category, price, quantity, URL protocol, URL length, missing product, missing `MONGODB_URI`, and Worker non-JSON bodies (`"Body must be JSON"`).

The Worker enforces the body cap by reading the bytes and rejecting `Content-Length` or `byteLength` above 2,097,152 before `JSON.parse`. Express uses `express.json({ limit: "2mb" })`, which is the same 2,097,152-byte ceiling, and `apiError` maps the payload-too-large error to the same 413 body. The larger limit applies to category JSON too. Category payloads stay small.

Publish and unpublish of a missing id use `PUT` and the existing 404. The image GET 404 uses a different message so a missing file is not reported as a missing product.

## Express and Worker parity

| Behavior | Express | Worker |
|---|---|---|
| Field rules, publish and stock defaults, image bytes, seed | `src/store.js` and `src/productInput.js` | Same modules |
| `POST` / `PUT` / `DELETE` `/api/products` | `src/routes/products.js` | `handleApi` product regex |
| `GET /api/products/:id/image` | `GET /:id/image` on the product router | Regex `^/api/products/([^/]+)/image$` matched before the one-segment product regex. Id is `decodeURIComponent`'d. |
| Body cap | `express.json({ limit: "2mb" })` and `apiError` | `readJson` byte check |
| Success image headers | Set on `res` | Set on `Response` |
| Non-GET on the image path | Falls through to the existing `/api` 404 `{ "error": "Not found" }` | 405 `{ "error": "Method not allowed" }` |

The non-GET image difference is the existing KI-002 gap. This change does not add an Express 405 handler. GET success and GET 404 JSON must match. `run_worker_first` already includes `/api/*`, so the Worker serves the image before assets. No `wrangler.toml` edit.

Page routes stay `/dashboard`, `/products`, and `/categories`. No new page path.

## Security

- Trust nothing in `imageFile` or `imageUrl`. Magic bytes, size, URL protocol, and URL length run on the server. The admin form repeats them so the admin sees the same sentences. A client check is not sufficient.
- Serve only the four allowlisted types. Set `nosniff`. Do not copy the client `Content-Type` onto the response unless it matched the signature.
- Do not fetch external image URLs on the server. The browser loads them in `<img>`. A failed load uses the placeholder.
- Do not log `dataBase64` or image bytes. Error messages name the rule, not the payload.
- Render names, descriptions, and status as React text. The placeholder stays an inline SVG constant.
- The image URL is not a secret capability URL. Anyone who can call the API can read the bytes. That matches the current unauthenticated catalog (KI-003). This change does not add auth, cookies, or CORS headers.
- `published: false` hides a product on `/dashboard` only. `GET /api/products` still returns it, and `PUT` can publish it again.
- No new secret. `MONGODB_DB` may stay in `wrangler.toml`. `MONGODB_URI` must not.

## Performance

The list response grows by two booleans per product. Image bytes move to one GET per visible upload, capped at 1 MB, with `Cache-Control: no-store` so a replaced file is not stuck behind the stable path. `?v=updatedAt` on the DOM `src` refreshes the admin and dashboard images after save without changing the stored reference. Base64 costs about one third extra on the write body only. Decoding is bounded by the 2 MB JSON cap. No pagination is added. `viewCatalog` still runs in the browser over the full list, which is the current catalog size.

## Risks / Trade-offs

- [Same image path after replace] → `no-store` plus a display-only `?v=` query. The stored `imageUrl` has no query, so round-trip equality stays stable.
- [List still returns unpublished products] → The dashboard filter lives in `viewCatalog`, which `npm test` covers. `/products` needs the full list. A query parameter would split the contract the admin page uses.
- [PUT that omits `published` keeps a draft unpublished] → The admin always sends a boolean. Old API clients that omit the field do not accidentally republish, and they also do not change a missing field away from the read default until some other explicit value is sent.
- [Create that omits `published` is published] → Matches current visibility. Callers that want a draft send `false`.
- [Image document and product document are two writes] → Validate first. Roll back the image document if the product write fails after an upload. Accept a possible orphan blob if a later delete fails. No multi-document transaction.
- [Signature-only files pass validation] → Avoids an image-decoder dependency. The placeholder covers display failure.
- [Express 100 KB default becomes 2 MB for every JSON API] → Required so a 1 MB upload fits. Category bodies are unchanged in practice. Oversize bodies get the same 413 text on both runtimes.
- [Read default treats corrupt non-false values as published] → Writes only store real booleans. A bad legacy value stays visible rather than hiding the row.
- [KI-002 remains for non-GET on the image path] → Documented above. GET is the contract this feature needs.
- [`npm test` still does not boot Mongo, Express, or the Worker] → Pure rules are unit-tested. HTTP parity stays a code-review plus manual check, as `testing.md` describes.

## Migration Plan

No batch migration and no new index. Deploy the existing web build and the current Express or Worker path. Old documents gain `published: true` on read. The first update writes the boolean. Empty databases seed published starter products with an empty image.

Rollback is a code revert. Leave `productImages` and any stored `published` values in place. The previous app ignores `published` and will show every product on the dashboard again. Upload paths in `imageUrl` will fail to load once `GET /api/products/:id/image` is gone, and the placeholder will show. External URLs keep working. No destructive cleanup is required to roll back.

After G2 approval, implementation follows `tasks.md`. This stage does not change source.

## Dependencies

No new npm package.

| Package | Where | Use |
|---|---|---|
| `express` ^4.21.2 | root | JSON body limit and the image route |
| `mongodb` ^6.18.0 | root | Product documents and `Binary` image documents |
| `react` / `react-router-dom` | `web` | Admin form and dashboard |
| `vite`, `wrangler` | existing dev tooling | Unchanged |

Node `>= 22`. Tests stay on `node:test`. The root `"test"` script gains `src/productInput.test.js` and `web/src/productImage.test.js` beside `web/src/catalogView.test.js`.

## Requirement mapping

| Requirement | Scenario | Tasks |
|---|---|---|
| Set product image by file upload or URL | Upload a valid file | 1.1, 1.2, 2.2, 2.4, 2.5, 3.3, 3.4, 4.3, 4.5 |
| Set product image by file upload or URL | Enter an `http` or `https` URL | 1.1, 1.2, 2.2, 4.3 |
| Set product image by file upload or URL | Switch file and URL on edit | 1.1, 2.3, 2.4, 2.5, 4.4 |
| Set product image by file upload or URL | Reject a bad file or URL | 1.1, 1.2, 3.1, 3.2, 4.3 |
| Publish and unpublish a product | Publish from `/products` | 2.1, 2.2, 2.3, 4.4, 4.5, 5.1 |
| Publish and unpublish a product | Unpublish and keep the admin row | 2.3, 4.4, 4.5, 5.1 |
| Publish and unpublish a product | Missing id returns 404 `"Product not found"` | 2.3, 3.5 |
| Product stock status | Toggle from `/products`, omitted defaults, non-boolean rejected | 1.1, 1.2, 2.1, 2.2, 2.3, 4.4, 4.5 |
| List products with resolved category names | Each item includes `published`, `inStock`, and `imageUrl` | 2.1, 3.5 |
| List products with resolved category names | Seed the three starter products | 2.6 |
| Create product with validated fields | Valid create, including optional image, `published`, and `inStock` | 2.2, 3.5 |
| Create product with validated fields | Blank name or unknown category | 2.2, 6.2 |
| Create product with validated fields | Bad price | 2.2, 6.2 |
| Create product with validated fields | Bad image or quantity | 1.1, 2.2, 4.3 |
| Update existing product | Valid update of image, `published`, or `inStock` sets `updatedAt` | 2.3, 4.4 |
| Update existing product | Missing id | 2.3 |
| Products administrative UI | Table with Status and Stock, form, icon actions, image, quantity, no cart, confirmed delete | 4.1, 4.3, 4.4, 4.5 |
| Display only published products on dashboard | Hide unpublished cards and counts | 5.1, 5.2, 5.4 |
| Display only published products on dashboard | Unpublish disappears on next dashboard load | 5.4, 6.2 |
| Display only published products on dashboard | Publish appears on next dashboard load | 5.4, 6.2 |
| Display only published products on dashboard | Card renders the upload or URL, or the placeholder | 4.1, 4.2, 5.3 |
| Price range checkboxes and whole-catalog bucket counts | Selected ranges filter published products only | 5.1, 5.2 |
| Price range checkboxes and whole-catalog bucket counts | Bucket counts ignore other filters and ignore unpublished products | 5.1, 5.2 |
| Loading, error, empty catalog, and zero-match filter states | API error still uses `.message.error` | 5.3 |
| Loading, error, empty catalog, and zero-match filter states | Zero published products: `No products yet.` and `0 items` | 5.1, 5.3 |
| Loading, error, empty catalog, and zero-match filter states | Filters match nothing published | 5.1, 5.3 |
| Dashboard route and landing page redirect | Products and categories load once on mount | 5.4 |
| Sort radio controls and catalog ordering | Four sort options, `Best Sellers` keeps fetched order | 5.1, 5.2 |
| Collapsible Availability filter control | `In Stock Only` excludes `inStock: false` | 5.1, 5.2 |
| Collapsible Categories checkbox filter | OR on selected categories, none selected excludes nothing | 5.1, 5.2, 5.4 |
| Result count header and removable active filter chips | Availability, price, then category chips | 5.1, 5.2 |
| Standard product cards for every matched product | Every matched product, including the first, is a standard card | 5.3 |

Delete of a product also deletes its image document (task 2.4) so a removed upload is not still served. The delete status contract itself is unchanged. Stock, category, sort, and chip rules are covered by the catalog tests (task 5.2).

## Open Questions

None. The five questions in `proposal.md` are decided in this document. `tasks.md` can be written from these decisions without a further product choice.
