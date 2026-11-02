# Domain Model

**Last updated:** 2026-11-02

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

- Seeded only when both `categories` and `products` collections have count 0. Seed names: Electronics, Books, Home.
- Create and update do not rewrite product documents. `categoryName` on products is resolved at read time.

### Entity: Product

Stored in MongoDB collection `products`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Mongo `_id`. UUID on create. Seed ids: `prod-mouse`, `prod-guide`, `prod-lamp`. |
| `name` | string | yes | Trimmed, non-empty. Not unique. |
| `sku` | string | no | Trimmed. Not unique. Empty string allowed. |
| `price` | number | yes | Finite and `>= 0`. Stored as `Math.round(price * 100) / 100`. |
| `categoryId` | string | yes | Must match an existing category `_id`. Unknown id is HTTP 400 `"Category not found"` (not 404). Blank is HTTP 400 `"Category is required"`. |
| `categoryName` | string | response only | Category `name`, or `""` when the category document is missing. |
| `description` | string | no | Trimmed. |
| `imageUrl` | string | no | Empty, or `http`/`https` URL. Longer than 2048 characters is HTTP 400 `"Image URL is too long"`. Other bad values are `"Image must be an http or https URL"`. |
| `quantity` | integer | yes | Whole number `>= 0`. Older documents without an integer `quantity` are returned as `0`. |
| `createdAt` | string | yes | ISO timestamp. |
| `updatedAt` | string | no | Set on update. Omitted from JSON when absent. |

**Invariants:**

- List order from the API is `createdAt` descending. No pagination.
- Delete of a missing id is HTTP 404 `"Product not found"`. Delete does not check the cart.
- Price and quantity rules are enforced in `src/store.js`. The products page also checks name, category, quantity, and image URL before submit. It does not pre-check price range; the server still does.

**Lifecycle:**

- Seeded with the categories when both collections are empty: Wireless Mouse (`EL-100`, 24.5, qty 10), Field Guide (`BK-015`, 18, qty 8), Desk Lamp (`HM-220`, 39, qty 5). All seed `imageUrl` values are `""`.
- Create returns HTTP 201 `{ item }`. Update returns HTTP 200 `{ item }`. Delete returns HTTP 200 `{ "deleted": true }`.

## Relationships

| From | To | Cardinality | Rule |
|---|---|---|---|
| Product | Category | many-to-one | `product.categoryId` references `category.id`. Products do not store `categoryName`. |
| Category | Product | one-to-many | Delete category is blocked while any product references it. Deleting a product does not delete the category. |

## Business rules

| ID | Rule | Enforced in |
|---|---|---|
| BR-1 | Category names are unique, case-insensitive, via query plus unique index. | `src/store.js` `findCategoryByName`, index `category_name_ci` |
| BR-2 | Product price is a non-negative finite number rounded to cents. | `requiredPrice` |
| BR-3 | Quantity is a non-negative integer. | `requiredQuantity` |
| BR-4 | Image URL is empty or `http`/`https`, max length 2048. | `optionalImageUrl` |
| BR-5 | Seed runs only when both collections are empty. A duplicate-key `11000` during seed is swallowed. | `ensureSeed` |
| BR-6 | Dashboard "In Stock Only" and color swatches do not remove products. | `productIsInStock` and `matchesColor` always return true. Spec requires this. |
| BR-7 | Admin cart adds one unit and stops at stored `quantity`. It is not persisted. | `web/src/components/Products.jsx` |
| BR-8 | Wishlist heart and `BUY NOW` do not call the API. `BUY NOW` has no click handler. The heart toggles `savedIds` for the mounted dashboard only. | `ProductPanel.jsx`, `Dashboard.jsx` |

## Derived / UI-only concepts

| Concept | Stored? | Behavior |
|---|---|---|
| Sort | no | Default `newest` (`createdAt` desc, `id` asc tie-break). `price-desc` / `price-asc` are numeric with the same tie-break; non-finite prices sort last. `best-sellers`, `weight-desc`, and `weight-asc` keep fetched order. |
| Price buckets | no | `[0,100)`, `[100,200)`, `[200,300)`, `[300,400)`, `>= 400`. Selected ranges combine with OR. Counts use the full loaded list and ignore other filters. |
| Availability `inStockOnly` | no | Chip and `aria-pressed` update. Every loaded product stays eligible. Does not read `quantity`. |
| Color swatches | no | Eight ids in `catalogView.js` `COLORS`. Selection does not filter products. |
| Featured tile | no | `viewCatalog` uses the first matched product as `featured` and the rest as `cards`. |
| Filter chips | no | Order: availability, price ranges in catalog order, colors in swatch order. Sort does not create a chip. |
| Wishlist | no | `Set` of product ids in dashboard state. |
| Cart | no | Map of product id to count on the products page. Cleared on reload. |
