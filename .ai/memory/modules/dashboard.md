# Module: dashboard

**Last updated:** 2026-11-04
**Paths:** `web/src/components/Dashboard.jsx`, `web/src/components/FilterPanel.jsx`, `web/src/components/ProductPanel.jsx`, `web/src/catalogView.js`, `web/src/catalogView.test.js`, `web/src/index.css`
**OpenSpec:** `openspec/specs/product-dashboard/spec.md`

## Responsibility

Customer-facing catalog at `/dashboard`. Load products once, then filter, sort, and present them in the browser. `GET /` redirects here.

## Public surface

| Kind | Name | Notes |
|---|---|---|
| Page | `/dashboard` | Two columns: filter panel and product panel. Below 960px the filter stacks above (`max-width: 959px`). |
| Fetch | `GET /api/products`, `GET /api/brands`, `GET /api/categories` | Once on mount, via `Promise.all`. A failure of any call sets the error status. Fallbacks are `Could not load products`, `Could not load brands`, and `Could not load categories`. |
| Pure API | `createFilterState`, `filterProducts`, `sortProducts`, `viewCatalog`, `activeChips`, `formatPrice` | `catalogView.js`. Brand rules are covered by `npm test`. |
| Controls | Sort radios, In Stock Only, five price ranges, brand checkboxes, category checkboxes | Sort is not collapsible. Availability, Price, Brands, and Categories are. Brands is immediately before Categories. Brand starts expanded (`collapsed.brand: false`). |
| Cards | Featured tile plus standard cards | Heart and `BUY NOW` are `type="button"`. `BUY NOW` has no `onClick`. |

## Dependencies

| Depends on | Why |
|---|---|
| `/api/products`, `/api/brands`, `/api/categories` | Products supply the grid. Brands and categories supply filter checkbox labels and chip labels. `categoryName` still comes on each product. Cards do not show `brandName`. |
| `catalogView.js` | Bucket bounds and predicates must stay in this module so tests and UI match. |

## Invariants

- Initial sort is `newest`. Filter state is not written to the URL or storage.
- Price counts use the published list and ignore filter state, including selected brands. Brand checkboxes have no counts. Zero brands shows `No brands yet.`
- `productIsInStock` returns true unless `inStock` is boolean false. Color swatches are not in this module. See KI-007.
- A non-empty `brandIds` set keeps products whose `brandId` is in the set. An empty set excludes nothing. A missing `brandId` fails a non-empty set. Brand, category, price, and In Stock Only combine with AND. `filterProducts` does not read `published`. `viewCatalog` runs `publishedCatalog` first.
- Grid columns: 5 at `>= 1280px`, 3 at `960–1279`, 2 at `640–959`, 1 below `640`. Implemented with `max-width` 1279, 959, and 639 in `index.css`.
- Empty fetch shows `No products yet.` Zero matches after filters show `0 items` and `No products match the selected filters.`
- Loading copy is `Loading products…`. Errors use `class="message error"`.
- `document.title` becomes `Dashboard` from `App.jsx`. The dashboard route does not render the admin `<h1>`.
- Unknown client routes in the loaded app `Navigate` to `/dashboard`.

## Change tips for agents

- Do not print `brandName` on cards or the featured tile unless the dashboard spec adds that text.
- Checkbox changes stay in memory and do not refetch.
- Keep sort ids in `SORT_OPTIONS` aligned with `STORED_SORTS` (`newest`, `price-desc`, `price-asc`). `best-sellers` is the current non-stored option and keeps fetched order.
- Featured tile is `items[0]` after filter and sort, not a separate query.
- Heart state lives in `savedIds` and is dropped when `Dashboard` unmounts.

## Related APIs / decisions

- [../apis/products.md](../apis/products.md)
- [../apis/brands.md](../apis/brands.md)
- [../apis/pages.md](../apis/pages.md)
