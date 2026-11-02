# Development Report: Product Dashboard

Status: implemented on 2026-11-02. Scope is the approved `docs/workflow/implementation-plan.md`. No commit, push, or pull request was made.

## Summary

The dashboard is a new storefront at `/dashboard` and is the landing page. `/` redirects there from Express and the Worker. Filter and sort math runs in the browser on the array returned by `GET /api/products`. The product and category documents, admin screens, and API contracts are unchanged. There is no cart, image field, or stock, color, weight, or best-seller field.

## Changed files

| File | Change |
|---|---|
| `web/src/catalogView.js` | New. Sort, price, and color catalogs, predicates, counts, chips, and `viewCatalog`. |
| `web/src/catalogView.test.js` | New. `node:test` coverage for the plan's catalog cases. |
| `web/src/components/Dashboard.jsx` | New. One product fetch, in-memory filters, and the session heart set. |
| `web/src/components/FilterPanel.jsx` | New. Sort, Availability, Price, and Color controls. |
| `web/src/components/ProductPanel.jsx` | New. Count, chips, featured tile, standard cards, and placeholder. |
| `web/src/App.jsx` | Dashboard route and nav item. `/` and unknown paths go to `/dashboard`. Admin title and `h1` stay off the dashboard. |
| `web/src/index.css` | Appended rules scoped to `.page-dashboard` and `.dashboard`. |
| `src/app.js` | `/dashboard` added to `pagePaths`. `GET /` redirects to `/dashboard`. |
| `src/worker.js` | `GET /` redirects to `/dashboard` with `new URL("/dashboard", url)`. |
| `package.json` | `"test": "node --test web/src/catalogView.test.js"`. |
| `README.md` | Documents `GET /` → `/dashboard` and `GET /dashboard`. API rows are unchanged. |
| `docs/workflow/development-report.md` | This report. |

Not modified: `src/store.js`, product and category routes, `Products.jsx`, `Categories.jsx`, `wrangler.toml`, and the approved requirements and implementation plan.

## Implementation decisions

- Default sort is `newest`. Best Sellers is the first radio and is not the default.
- Filter state stays in React state on `Dashboard`. Reload clears it. Nothing is written to the URL, `localStorage`, or the API.
- `productIsInStock` and `matchesColor` return true for every product. Price ranges use half-open bounds, and `$400 and up` is `price >= 400`. Counts come from the full fetched list.
- Newest and both price sorts copy the array and break ties by `id` ascending. Non-finite prices and unparseable timestamps sort last. Best Sellers and both Weight options return a copy of the fetched order.
- The first filtered item is the featured tile: placeholder, uppercase `categoryName` when present, and `name`. It has no price, heart, or BUY NOW. Later items are standard cards.
- The heart toggles `aria-pressed` for that product id in component state only. BUY NOW is a `type="button"` control with no navigation and no request.
- Color ids are `black`, `white`, `gold`, `silver`, `red`, `blue-navy`, `green`, and `yellow`. Swatch fills are CSS classes under `.dashboard`.
- Dashboard button padding is reset under `.dashboard` so the global `button { padding: 0 16px 4px }` rule does not shape the storefront. Admin button padding is unchanged.
- `clearChip` removes one availability, price, or color selection and leaves the rest.

## Tests

Command: `npm test`

Result: 14 passed, 0 failed (`node --test web/src/catalogView.test.js`).

The tests cover option order, price boundaries, seed counts, price OR, counts that ignore other filters, in-stock and color non-exclusion, newest and price ordering, unstored sorts, chip order and removal, the featured split, price formatting, and negative or non-finite prices.

## Manual checklist

Express was running with `npm run dev` on http://localhost:3000. `MONGODB_URI` came from the gitignored `.env`. The browser checklist used the Orca browser.

| Check | Result |
|---|---|
| AC-1 | `GET /` returned 302 to `/dashboard`. `/dashboard` rendered the filter panel and product panel. `document.title` was `Dashboard`. There was no admin `h1` and no console error. |
| AC-2 | Six sort radios were in order, with Newest selected on load. Price low-to-high showed Field Guide, then Wireless Mouse at `$24.50`, then Desk Lamp at `$39.00`. Price high-to-low reversed that. Best Sellers restored the fetched order (Wireless Mouse, Field Guide, Desk Lamp) instead of keeping the previous price order. |
| AC-3 | In Stock Only showed the `In Stock Only ×` chip and left 3 items. Removing the chip cleared `aria-pressed`. |
| AC-4 | Seed price counts were 3, 0, 0, 0, 0. Checking `below $100` left 3 items and did not change the other counts. |
| AC-5 | Eight swatches were present. Selecting Black showed `Black ×` and left the seed products visible. |
| AC-6 | The first match was the tall tile with a placeholder and a black caption and without BUY NOW. Later cards showed a placeholder, heart, category, name, `$XX.XX`, and BUY NOW. At 1400px the grid had 5 columns and the panels sat side by side. At 1100px it had 3 columns, still side by side. At 800px the filter stacked above a 2-column grid. At 500px the grid had 1 column. |
| AC-7 | `/products` listed the three products inside the 1100px admin page. Add, edit, and delete were exercised with a temporary product that was removed afterward. `/categories` listed the existing categories with the same admin width and `#eef2f5` background. `GET /api/products` and `GET /api/categories` still return `{ items }`. |
| FR-9 | Before `.env` was loaded, the dashboard showed `MONGODB_URI is not set` in `.message.error`, not the empty-filter copy. With data loaded, `$400 and up` showed `0 items` and `No products match the selected filters.` Counts stayed 3, 0, 0, 0, 0. |
| FR-8 | BUY NOW left the URL at `/dashboard` and did not send a new request. The heart filled only the clicked card (`Remove Field Guide from wishlist`). After reload it was `Save …` again. |
| NFR-4 | Sort radios, collapse buttons, the stock toggle, price checkboxes, swatches, chips, hearts, and BUY NOW were exposed as named controls. Collapsing Availability set `aria-expanded="false"` and removed In Stock Only from the accessibility tree. |
| NFR-3 | Changing a price checkbox updated the grid without navigation. The only product requests on a dashboard load were the initial `GET /api/products` calls. |

A product named `Dashboard Check` at `$120.00` was created from `/products`. After opening `/dashboard` it was the featured tile, the header read `4 items`, and the `$100 to $199` count was 1. It was then edited through `PUT /api/products/<id>` and deleted. The catalog again listed Wireless Mouse, Field Guide, and Desk Lamp.

Worker preview was not started. `src/worker.js` and `src/app.js` both send `GET /` to `/dashboard`. `run_worker_first` was not changed. The Worker SPA fallback already serves `/dashboard`.

## Deviations

None. The approved plan was implemented as written. `priceBucket`, `createFilterState`, and `clearChip` live in `catalogView.js` so the components do not reimplement the bucket rules.

## Known limitations

- Best Sellers, Weight, Color, and In Stock Only do not hide products. Those fields are not stored.
- The heart is not a wishlist. It is dropped on navigation, reload, and unmount, and it does not call the API.
- BUY NOW does not add a cart item.
- Products have no image. Every card uses the same inline SVG.
- Visual spacing can differ from the reference screenshot because that file is not in the repository.
- `npm test` covers catalog math only. Layout was checked in the browser.
- `/` no longer opens the product admin table. `/products` remains that page.
- The local Worker was not previewed in this pass.
