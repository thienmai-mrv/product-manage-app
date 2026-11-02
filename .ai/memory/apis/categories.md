# API: categories

**Last updated:** 2026-11-02
**Handlers:** Express `src/routes/categories.js` · Worker `src/worker.js` `handleApi` category regex

## Endpoints

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/categories` | none | 200 `{ "items": [...] }` sorted by `createdAt` descending | 500 |
| POST | `/api/categories` | `name`; optional `description` | 201 `{ "item": {...} }` with `productCount: 0` | 400 `Name is required`; 409 name conflict |
| PUT | `/api/categories/:id` | same fields | 200 `{ "item": {...} }` including current `productCount` and `updatedAt` | 400; 404 `Category not found`; 409 name conflict |
| DELETE | `/api/categories/:id` | none | 200 `{ "deleted": true }` | 404 `Category not found`; 409 `Move or delete products in this category first` |

There is no `GET /api/categories/:id`.

Item fields: `id`, `name`, `description`, `createdAt`, optional `updatedAt`, `productCount`.

## Shared contract rules

- Name uniqueness is case-insensitive (`locale: "en"`, collation strength 2) against other categories. Updating a category may keep its own name.
- Conflict message is `A category with that name already exists`.
- Description is optional and stored trimmed.
- `productCount` is the number of product documents with that `categoryId` at read time.
- Seeded category ids are not UUIDs. Created ids are UUIDs.

## Parity notes

Must match on Express and Worker. See [runtime-parity.md](../runtime-parity.md).

List order and error strings come from `src/store.js`, so both hosts share them when the HTTP layer does not replace the error.

## Examples

### Success

```json
{
  "items": [
    {
      "id": "cat-electronics",
      "name": "Electronics",
      "description": "Devices and accessories",
      "createdAt": "2026-11-02T00:00:00.000Z",
      "productCount": 1
    }
  ]
}
```

### Error

```json
{ "error": "A category with that name already exists" }
```
