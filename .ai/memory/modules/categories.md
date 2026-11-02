# Module: categories

**Last updated:** 2026-11-02
**Paths:** `src/store.js` (`listCategories`, `addCategory`, `updateCategory`, `deleteCategory`, `toCategory`), `src/routes/categories.js`, `src/worker.js` category regex, `web/src/components/Categories.jsx`
**OpenSpec:** `openspec/specs/category-management/spec.md`

## Responsibility

Store categories, keep names unique without regard to case, expose a product count, and present an unauthenticated admin table.

## Public surface

| Kind | Name | Notes |
|---|---|---|
| API | `/api/categories` | See [../apis/categories.md](../apis/categories.md). |
| Page | `/categories` | Columns: No, Name, Description, Products, Action. |
| UI actions | Add, Edit, Delete | Delete uses `window.confirm`. The API still rejects a non-empty category. |

## Dependencies

| Depends on | Why |
|---|---|
| Products collection | `productCount` and the delete guard. |
| Unique index `category_name_ci` | Backstop for the application-level name check. |

## Invariants

- Name is required and trimmed.
- Uniqueness uses collation `{ locale: "en", strength: 2 }` and HTTP 409 on conflict.
- `productCount` is computed, not stored.
- A category with any product cannot be deleted.
- Seed ids are `cat-electronics`, `cat-books`, and `cat-home`. Created ids are UUIDs.
- Renaming a category does not update product documents.

## Change tips for agents

- Keep the pre-check in `findCategoryByName` and the unique index together. The index uses the same collation.
- UNCONFIRMED: the spec says case-insensitive and does not mention accents. Strength 2 is diacritic-sensitive, so `Cafe` and `Café` are different names in this code.
- The products page loads this list to fill the category select. It uses `categories[0].id` as the default for a new product when the list is non-empty.

## Related APIs / decisions

- [../apis/categories.md](../apis/categories.md)
- [../decisions/002-per-request-mongo-client.md](../decisions/002-per-request-mongo-client.md)
