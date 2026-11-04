# Domain Model

**Last updated:** 2026-11-04

## Entities

### Entity: Category

Stored in MongoDB collection `categories`. API name is the mapped object from `toCategory`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Mongo `_id`. `crypto.randomUUID()` on create. Seed rows use `cat-electronics`, `cat-books`, `cat-home`. |
| `name` | string | yes | Trimmed, non-empty. Unique under collation `{ locale: "en", strength: 2 }` (case-insensitive). Index name `category_name_ci`. |
| `description` | string | no | Trimmed. Missing documents read back as `""`. |
| `createdAt` | string | yes | ISO timestamp from `new Date().toISOString()`. |
| `updatedAt` | string | no | Set on update. Omitted from JSON when absent. |
| `productCount` | number | response only | Count of products whose `categoryId` equals this id. Not stored. |

**Invariants:**

- Empty or whitespace `name` returns HTTP 400 `"Name is required"`.
- A name that matches another category under the collation returns HTTP 409 `"A category with that name already exists"`. Duplicate-key code `11000` is mapped to the same message.
- Delete returns HTTP 409 `"Move or delete products in this category first"` when `productCount` would be greater than 0. Missing id returns HTTP 404 `"Category not found"`.

**Lifecycle:**

- Seeded only when both `categories` and `products` collections have count 0, and only after the brand seed has run. Seed names: Electronics, Books, Home.
- Create and update do not rewrite product documents. `categoryName` on products is resolved at read time.

### Entity: Brand

Stored in MongoDB collection `brands`. API name is the mapped object from `toBrand`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Mongo `_id`. `crypto.randomUUID()` on create. Sample rows use the `brand-*` ids below. |
| `name` | string | yes | Trimmed, non-empty. Unique under collation `{ locale: "en", strength: 2 }` (case-insensitive). Index name `brand_name_ci`. |
| `description` | string | no | Trimmed. Missing documents read back as `""`. Sample rows store `""`. |
| `createdAt` | string | yes | ISO timestamp. Sample rows are one second apart. |
| `updatedAt` | string | no | Set on update. Omitted from JSON when absent. |
| `productCount` | number | response only | Count of products whose `brandId` equals this id. Not stored. |

**Invariants:**

- Empty or whitespace `name` returns HTTP 400 `"Name is required"`.
- A name that matches another brand under the collation returns HTTP 409 `"A brand with that name already exists"`. Duplicate-key code `11000` is mapped to the same message.
- Delete returns HTTP 409 `"Move or delete products in this brand first"` when any product has that `brandId`. Missing id returns HTTP 404 `"Brand not found"`.

**Lifecycle:**

- `ensureBrandSeed` inserts ten brands when `brands` count is 0, even if categories or products already exist. Names, newest first: Samsung, Sony, LG, Panasonic, Toshiba, Apple, Electrolux, Daikin, Sharp, Casper. Ids are `brand-samsung` through `brand-casper` in that same order. The list is hardcoded. No request is made to `dienmayxanh.com`.
- A duplicate-key `11000` during that insert is swallowed. Any other error is rethrown.
- Create and update do not rewrite product documents. `brandName` on products is resolved at read time.

### Entity: Product

Stored in MongoDB collection `products`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Mongo `_id`. UUID on create. Seed ids: `prod-mouse`, `prod-guide`, `prod-lamp`. |
| `name` | string | yes | Trimmed, non-empty. Not unique. |
| `sku` | string | no | Trimmed. Not unique. Empty string allowed. |
| `price` | number | yes | Finite and `>= 0`. Stored as `Math.round(price * 100) / 100`. |
| `brandId` | string | yes on create and update | Must match an existing brand `_id`. Blank is HTTP 400 `"Brand is required"`. Unknown id is HTTP 400 `"Brand not found"`. Checked after name and before category. A stored document with no `brandId` reads back as `""` and is not backfilled. |
| `brandName` | string | response only | Brand `name`, or `""` when the brand document is missing. |
| `categoryId` | string | yes | Must match an existing category `_id`. Unknown id is HTTP 400 `"Category not found"` (not 404). Blank is HTTP 400 `"Category is required"`. |
| `categoryName` | string | response only | Category `name`, or `""` when the category document is missing. |
| `description` | string | no | Trimmed. |
| `imageUrl` | string | no | Empty, or `http`/`https` URL. Longer than 2048 characters is HTTP 400 `"Image URL is too long"`. Other bad values are `"Image must be an http or https URL"`. |
| `quantity` | integer | yes | Whole number `>= 0`. Older documents without an integer `quantity` are returned as `0`. |
| `published` | boolean | stored | `toProduct` returns true unless the stored value is boolean false. Omitted create input defaults to true. Omitted update input keeps the current value. Already on `main` before add-brand-manage. |
| `inStock` | boolean | stored | Same read and write rules as `published`. Already on `main` before add-brand-manage. |
| `createdAt` | string | yes | ISO timestamp. |
| `updatedAt` | string | no | Set on update. Omitted from JSON when absent. |

**Invariants:**

- List order from the API is `createdAt` descending. No pagination.
- Delete of a missing id is HTTP 404 `"Product not found"`. Delete does not check the cart.
- Create and update check order for identity fields is name, then brand (required, then exists), then category (required, then exists), then the existing price, quantity, image, `published`, and `inStock` checks. A missing product on update is HTTP 404 `"Product not found"` before field checks.
- Price and quantity rules are enforced in `src/store.js`. The products page also checks name, brand, category, quantity, and image URL before submit. It does not pre-check price range; the server still does.
- Stock and publish toggles send `brandId: item.brandId ?? ""`. A legacy row with no brand gets HTTP 400 `"Brand is required"` and the page leaves the row unchanged.

**Lifecycle:**

- Seeded with the categories when both of those collections are empty, after the brand seed: Wireless Mouse (`EL-100`, 24.5, qty 10, Samsung), Field Guide (`BK-015`, 18, qty 8, Sony), Desk Lamp (`HM-220`, 39, qty 5, Panasonic). All seed `imageUrl` values are `""`. All three seed `published: true` and `inStock: true`.
- If a named starter brand is missing because `brands` was already non-empty, the newest brand (`createdAt` descending) is used. If no brand document exists after the brand-seed attempt, category and product inserts are skipped.
- Create returns HTTP 201 `{ item }`. Update returns HTTP 200 `{ item }`. Delete returns HTTP 200 `{ "deleted": true }`. Deleting a product does not delete the brand. The brand's `productCount` changes on the next list.

## Relationships

| From | To | Cardinality | Rule |
|---|---|---|---|
| Product | Brand | many-to-one | `product.brandId` references `brand.id`. Products do not store `brandName`. |
| Product | Category | many-to-one | `product.categoryId` references `category.id`. Products do not store `categoryName`. |
| Brand | Product | one-to-many | Delete brand is blocked while any product references it. Deleting a product does not delete the brand. |
| Category | Product | one-to-many | Delete category is blocked while any product references it. Deleting a product does not delete the category. |

## Business rules

| ID | Rule | Enforced in |
|---|---|---|
| BR-1 | Category names are unique, case-insensitive, via query plus unique index. | `src/store.js` `findCategoryByName`, index `category_name_ci` |
| BR-2 | Product price is a non-negative finite number rounded to cents. | `requiredPrice` |
| BR-3 | Quantity is a non-negative integer. | `requiredQuantity` |
| BR-4 | Image URL is empty or `http`/`https`, max length 2048. | `optionalImageUrl` |
| BR-5 | Sample brands insert when `brands` is empty. Starter categories and products insert only when both of those collections are empty. A duplicate-key `11000` during either insert is swallowed. | `ensureBrandSeed`, `ensureSeed` |
| BR-6 | Dashboard "In Stock Only" excludes products whose `inStock` is boolean false. A missing flag stays included. The toggle does not read `quantity`. | `productIsInStock` in `catalogView.js`. This predicate was already on `main`. |
| BR-7 | Admin cart adds one unit and stops at stored `quantity`. It is not persisted. | `web/src/components/Products.jsx` |
| BR-8 | Wishlist heart and `BUY NOW` do not call the API. `BUY NOW` has no click handler. The heart toggles `savedIds` for the mounted dashboard only. | `ProductPanel.jsx`, `Dashboard.jsx` |
| BR-9 | Brand names are unique, case-insensitive, via query plus unique index. | `src/store.js` `findBrandByName`, index `brand_name_ci` |
| BR-10 | Dashboard brand checkboxes combine with OR. An empty brand selection excludes nothing. Brand, category, price, and In Stock Only combine with AND. Unpublished products are removed before those filters. | `filterProducts`, `publishedCatalog`, `viewCatalog` |

## Derived / UI-only concepts

| Concept | Stored? | Behavior |
|---|---|---|
| Sort | no | `SORT_OPTIONS` is Best Sellers, Newest, Price:High-Low, Price:Low-High. Default `newest` (`createdAt` desc, `id` asc tie-break). Price sorts are numeric with the same tie-break; non-finite prices sort last. Any other sort id, including `best-sellers`, keeps fetched order. Weight sort ids are in the dashboard spec and are not in `SORT_OPTIONS`. |
| Price buckets | no | `[0,100)`, `[100,200)`, `[200,300)`, `[300,400)`, `>= 400`. Selected ranges combine with OR. Dashboard counts use the published list and ignore other filters. |
| Availability `inStockOnly` | no | Chip and `aria-pressed` update. Products with `inStock === false` drop out. Does not read `quantity`. |
| Brand filter `brandIds` | no | OR of selected brand ids. A product with a missing `brandId` fails a non-empty selection. Checkboxes have no counts. Empty list copy is `No brands yet.` |
| Color swatches | no | Not present in current `catalogView.js` or `FilterPanel.jsx`. The dashboard spec still describes eight swatches. See known issues. |
| Featured tile | no | `viewCatalog` uses the first matched product as `featured` and the rest as `cards`. The tile shows `categoryName`, not `brandName`. |
| Filter chips | no | Order: availability, price ranges in catalog order, brands in the brands-array order, then categories. An unknown selected id uses the raw id as the label. Sort does not create a chip. |
| Wishlist | no | `Set` of product ids in dashboard state. |
| Cart | no | Map of product id to count on the products page. Cleared on reload. |
