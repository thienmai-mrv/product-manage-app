# Module: brands

**Last updated:** 2026-11-04
**Paths:** `src/store.js` (`listBrands`, `addBrand`, `updateBrand`, `deleteBrand`, `toBrand`, `ensureBrandSeed`), `src/routes/brands.js`, `src/worker.js` brand regex, `web/src/components/Brands.jsx`
**OpenSpec:** `openspec/specs/brand-management/spec.md`

## Responsibility

Store brands, keep names unique without regard to case, expose a product count, seed ten sample brands when the collection is empty, and present an unauthenticated admin table.

## Public surface

| Kind | Name | Notes |
|---|---|---|
| API | `/api/brands` | See [../apis/brands.md](../apis/brands.md). |
| Page | `/brands` | Columns: No, Name, Description, Products, Action. Width uses `page page-wide` (up to 1600px). `document.title` and `<h1>` are `Brands`. |
| UI actions | Add, Edit, Delete | Delete uses `window.confirm` with the text `Delete <name>?`. The API still rejects a brand that any product references. |
| Seed | `ensureBrandSeed` | Inserts the ten sample rows only when `brands` count is 0. Does not call the network. |

## Dependencies

| Depends on | Why |
|---|---|
| Products collection | `productCount` and the delete guard use `brandId`. |
| Unique index `brand_name_ci` | Backstop for the application-level name check. Collation `{ locale: "en", strength: 2 }`. |
| `withDatabase` | Seed and index run on the same per-request client as categories. |

## Invariants

- Name is required and trimmed. Description is optional and trimmed. Missing description reads back as `""`.
- Uniqueness uses the same collation as categories. Conflict is HTTP 409 `"A brand with that name already exists"`. Keeping or only changing the case of the brand's own name succeeds.
- `productCount` is computed, not stored.
- Delete of a missing id is HTTP 404 `"Brand not found"`. Delete while any product has that `brandId` is HTTP 409 `"Move or delete products in this brand first"`.
- Sample ids are `brand-samsung`, `brand-sony`, `brand-lg`, `brand-panasonic`, `brand-toshiba`, `brand-apple`, `brand-electrolux`, `brand-daikin`, `brand-sharp`, `brand-casper`. Created ids are UUIDs.
- Sample `createdAt` values are one second apart so `GET /api/brands` order is Samsung first and Casper last. Descriptions are `""`.
- Renaming a brand does not update product documents. `brandName` is resolved at read time.
- There is no `GET /api/brands/:id`.

## Change tips for agents

- Copy category behavior in `src/store.js` rather than a second validation style. Brand catch sites pass the brand conflict sentence into `rethrowDuplicate`.
- Seed brands whenever `brands` is empty, including when categories and products already exist. Do not attach those brands to old product rows.
- The products page and the dashboard both load this list. The add-product form uses `brands[0].id` when the list is non-empty. After the sample seed, that first row is Samsung.
- Navigation order is `Dashboard | Products | Brands | Categories` in `web/src/App.jsx`.

## Related APIs / decisions

- [../apis/brands.md](../apis/brands.md)
- [categories.md](categories.md)
- [../decisions/002-per-request-mongo-client.md](../decisions/002-per-request-mongo-client.md)
