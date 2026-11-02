# Module: products

**Last updated:** 2026-11-02
**Paths:** `src/store.js` (`listProducts`, `addProduct`, `updateProduct`, `deleteProduct`, `toProduct`), `src/routes/products.js`, `src/worker.js` product regex, `web/src/components/Products.jsx`
**OpenSpec:** `openspec/specs/product-management/spec.md`

## Responsibility

Store products, validate writes, list them with a resolved category name, and present an unauthenticated admin table with inline create, edit, delete, and an in-memory cart.

## Public surface

| Kind | Name | Notes |
|---|---|---|
| API | `/api/products` | See [../apis/products.md](../apis/products.md). |
| Page | `/products` | Columns: No, Name, SKU, Category, Price, Image, Quantity, Description, Action. |
| UI actions | Add, Edit, Delete, Add to Cart | Delete uses `window.confirm`. Cart is local state. |
| Function | `addToCart` | Adds one unit until `cart[id] >= item.quantity`. |

## Dependencies

| Depends on | Why |
|---|---|
| Categories | `categoryId` must exist. `categoryName` is joined at read time. |
| `src/store.js` | Shared validation and Mongo writes. |
| `web/src/api.js` | Browser JSON calls. |

## Invariants

- API list order is `createdAt` descending.
- New ids are UUIDs. Seed ids are the stable `prod-*` strings.
- `sku` and `name` are not unique.
- Price is rounded to cents. Quantity is a non-negative integer.
- The cart is cleared on reload and is not written by POST or PUT.
- Deleting a product removes its cart line in the current page state.

## Change tips for agents

- Change field rules in `src/store.js` first, then mirror any new HTTP status in both the Express router and `src/worker.js`.
- The admin form's default quantity for a new product is the string `"1"`. Edit loads `item.quantity`.
- Client checks do not replace server checks. Price range is server-enforced.
- Dashboard display of products lives in the dashboard module, not here.

## Related APIs / decisions

- [../apis/products.md](../apis/products.md)
- [../decisions/001-dual-express-worker-runtime.md](../decisions/001-dual-express-worker-runtime.md)
