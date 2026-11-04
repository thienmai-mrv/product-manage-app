# API: brands

**Last updated:** 2026-11-04
**Handlers:** Express `src/routes/brands.js` mounted at `/api/brands` · Worker `src/worker.js` `handleApi` brand regex `^/api/brands(?:/([^/]+))?$`

## Endpoints

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/brands` | none | 200 `{ "items": [...] }` sorted by `createdAt` descending | 500 |
| POST | `/api/brands` | `name`; optional `description` | 201 `{ "item": {...} }` with `productCount: 0` | 400 `Name is required`; 409 name conflict |
| PUT | `/api/brands/:id` | same fields | 200 `{ "item": {...} }` including current `productCount` and `updatedAt` | 400; 404 `Brand not found`; 409 name conflict |
| DELETE | `/api/brands/:id` | none | 200 `{ "deleted": true }` | 404 `Brand not found`; 409 `Move or delete products in this brand first` |

There is no `GET /api/brands/:id`. On the Worker that path is 405 `{ "error": "Method not allowed" }`. Express does not register a 405 for it (KI-002).

Item fields: `id`, `name`, `description`, `createdAt`, optional `updatedAt`, `productCount`.

## Shared contract rules

- Name uniqueness is case-insensitive (`locale: "en"`, collation strength 2) against other brands. Updating a brand may keep its own name, including a case-only change.
- Conflict message is `A brand with that name already exists`.
- Description is optional and stored trimmed.
- `productCount` is the number of product documents with that `brandId` at read time.
- When `brands` is empty, the next store operation inserts the ten sample brands before the caller's operation. Sample ids are not UUIDs. Created ids are UUIDs.
- The sample list is hardcoded in `src/store.js`. The server does not request `dienmayxanh.com`.

## Parity notes

Must match on Express and Worker. See [runtime-parity.md](../runtime-parity.md).

List order and error strings come from `src/store.js`, so both hosts share them when the HTTP layer does not replace the error. The Worker brand branch sits after the category branch and `decodeURIComponent`s the id.

## Examples

### Success

```json
{
  "items": [
    {
      "id": "brand-samsung",
      "name": "Samsung",
      "description": "",
      "createdAt": "2026-11-04T00:00:10.000Z",
      "productCount": 1
    }
  ]
}
```

### Error

```json
{ "error": "A brand with that name already exists" }
```
