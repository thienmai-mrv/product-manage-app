# API: products

**Last updated:** 2026-11-04
**Handlers:** Express `src/routes/products.js` · Worker `src/worker.js` `handleApi` product regex

## Endpoints

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/products` | none | 200 `{ "items": [...] }` sorted by `createdAt` descending | 500 if Mongo is unavailable or URI is missing |
| POST | `/api/products` | `name`, `brandId`, `categoryId`, `price`, `quantity`; optional `sku`, `description`, `imageUrl`, `published`, `inStock` | 201 `{ "item": {...} }` | 400 validation, including `Brand is required` and `Brand not found`; 500 |
| PUT | `/api/products/:id` | same fields as create | 200 `{ "item": {...} }` with `updatedAt` | 400 validation, including the brand errors; 404 `Product not found` |
| DELETE | `/api/products/:id` | none | 200 `{ "deleted": true }` | 404 `Product not found` |

There is no `GET /api/products/:id`. On the Worker that path is 405. Express does not register it.

Item fields: `id`, `name`, `sku`, `price`, `brandId`, `brandName`, `categoryId`, `categoryName`, `description`, `imageUrl`, `quantity`, `published`, `inStock`, `createdAt`, optional `updatedAt`. `brandName` is `""` when the brand cannot be resolved. A missing stored `brandId` is returned as `""`.

## Shared contract rules

- `name`, `brandId`, and `categoryId` are required after trim. Brand is checked before category.
- `brandId` must already exist or the error is `Brand not found` (400). Blank is `Brand is required` (400).
- `categoryId` must already exist or the error is `Category not found` (400).
- `price` must be a finite number `>= 0`. It is stored rounded to two decimals. Error: `Price must be a number that is zero or greater`.
- `quantity` must be an integer `>= 0`. Error: `Quantity must be a whole number that is zero or greater`.
- `imageUrl` empty or `http`/`https`. Too long (over 2048) is `Image URL is too long`. Otherwise `Image must be an http or https URL`.
- `sku` and `description` are optional trimmed strings.
- The first store call can seed brands when `brands` is empty, then categories and products when both of those collections are empty. See domain model.

## Parity notes

Must match on Express and Worker. See [runtime-parity.md](../runtime-parity.md).

Worker rejects a non-JSON body with 400 `Body must be JSON` before validation. Express depends on `express.json()`.

## Examples

### Success

```json
{
  "item": {
    "id": "generated-uuid",
    "name": "Wireless Mouse",
    "sku": "EL-100",
    "price": 24.5,
    "brandId": "brand-samsung",
    "brandName": "Samsung",
    "categoryId": "cat-electronics",
    "categoryName": "Electronics",
    "description": "Compact Bluetooth mouse",
    "imageUrl": "",
    "quantity": 10,
    "createdAt": "2026-11-02T00:00:00.000Z"
  }
}
```

### Error

```json
{ "error": "Price must be a number that is zero or greater" }
```
