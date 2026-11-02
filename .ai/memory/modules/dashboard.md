# Module: dashboard

**Last updated:** 2026-11-02
**Paths:** `web/src/components/Dashboard.jsx`, `web/src/components/FilterPanel.jsx`, `web/src/components/ProductPanel.jsx`, `web/src/catalogView.js`, `web/src/catalogView.test.js`, `web/src/index.css`
**OpenSpec:** `openspec/specs/product-dashboard/spec.md`

## Responsibility

Customer-facing catalog at `/dashboard`. Load products once, then filter, sort, and present them in the browser. `GET /` redirects here.

## Public surface

| Kind | Name | Notes |
|---|---|---|
| Page | `/dashboard` | Two columns: filter panel and product panel. Below 960px the filter stacks above (`max-width: 959px`). |
| Fetch | `GET /api/products` | Once on mount. Failures use fallback `Could not load products`. |
| Pure API | `createFilterState`, `filterProducts`, `sortProducts`, `viewCatalog`, `formatPrice` | `catalogView.js`. Covered by `npm test`. |
| Controls | Sort radios, In Stock Only, five price ranges, eight color swatches | Sort section is not collapsible. The other three are. |
| Cards | Featured tile plus standard cards | Heart and `BUY NOW` are `type="button"`. `BUY NOW` has no `onClick`. |

## Dependencies

| Depends on | Why |
|---|---|
| `/api/products` | The only data source. Categories are not fetched; `categoryName` comes on each product. |
| `catalogView.js` | Bucket bounds and predicates must stay in this module so tests and UI match. |

## Invariants

- Initial sort is `newest`. Filter state is not written to the URL or storage.
- Price counts use the full fetched list.
- `productIsInStock` and `matchesColor` return true. Selecting them still shows chips.
- Grid columns: 5 at `>= 1280px`, 3 at `960–1279`, 2 at `640–959`, 1 below `640`. Implemented with `max-width` 1279, 959, and 639 in `index.css`.
- Empty fetch shows `No products yet.` Zero matches after filters show `0 items` and `No products match the selected filters.`
- Loading copy is `Loading products…`. Errors use `class="message error"`.
- `document.title` becomes `Dashboard` from `App.jsx`. The dashboard route does not render the admin `<h1>`.
- Unknown client routes in the loaded app `Navigate` to `/dashboard`.

## Change tips for agents

- Do not make stock or color exclusive filters unless the dashboard spec changes.
- Keep sort ids in `SORT_OPTIONS` aligned with `STORED_SORTS` (`newest`, `price-desc`, `price-asc`). The other three ids must keep fetched order.
- Featured tile is `items[0]` after filter and sort, not a separate query.
- Heart state lives in `savedIds` and is dropped when `Dashboard` unmounts.

## Related APIs / decisions

- [../apis/products.md](../apis/products.md)
- [../apis/pages.md](../apis/pages.md)
