# Design

## Context

Approved behavior is `openspec/specs/product-dashboard/spec.md`. Product and category CRUD stay as specified in `openspec/specs/product-management/spec.md` and `openspec/specs/category-management/spec.md`. This change adds a storefront view. It does not add product fields, API writes, or a cart.

The app is one React 19 SPA (`web/`) and one JSON API, stored in MongoDB (`src/store.js`). The same API and page routes run on Express (`src/app.js`, local) and a Cloudflare Worker (`src/worker.js`, deploy). Express has no SPA fallback, so each HTML path must be listed. The Worker asset binding uses `not_found_handling = "single-page-application"`, and `run_worker_first` is only `/`, `/api`, and `/api/*`.

Before this change, `GET /` redirected to `/products`. The UI was the admin tables on `/products` and `/categories`.

## Goals / Non-Goals

**Goals:**

- Serve `/dashboard` and redirect `GET /` to it with HTTP 302 on Express and the Worker.
- Filter and sort the loaded catalog in the browser. Only stored `price` and `createdAt` change order or membership.
- Keep `/products`, `/categories`, and both REST contracts unchanged.
- Unit-test the catalog math with `node:test`. Add no npm dependency.

**Non-Goals:**

- Schema fields for image, stock, color, weight, or best-seller rank.
- A cart, checkout, or persisted wishlist.
- URL or `localStorage` sync for filters.
- Server-side filter query parameters.

## Existing architecture

| Layer | Module | Role |
|---|---|---|
| Local server | `server.js`, `src/app.js` | Loads `.env`, mounts the API, redirects `/`, and serves the SPA for listed page paths. |
| Worker | `src/worker.js`, `wrangler.toml` | Same API and `/` redirect. Page HTML comes from the asset binding. |
| Store | `src/store.js` | Mongo client per call, seed, validation, and JSON mapping. |
| API | `src/routes/products.js`, `src/routes/categories.js` | Express routers. The Worker repeats the same methods in `handleApi`. |
| Admin UI | `web/src/components/Products.jsx`, `Categories.jsx` | CRUD tables. Products loads both APIs. Categories loads categories only. |
| Shell | `web/src/App.jsx`, `web/src/index.css` | Nav, titles, and the 1100px admin layout. |
| HTTP helper | `web/src/api.js` | `requestJson` throws `Error` from `body.error`. |

`listProducts` sorts `{ createdAt: -1 }` and joins `categoryName` in `toProduct`. The dashboard still sorts again so the grid does not depend on that server order.

## Database changes

No migration, new collection, new field, or new index.

`products` documents stay `_id`, `name`, `sku`, `price` (non-negative, two decimals), `categoryId`, `description`, `createdAt`, and optional `updatedAt`.

`categories` documents stay `_id`, `name` (unique, case-insensitive), `description`, `createdAt`, and optional `updatedAt`. The only index remains `category_name_ci` on `categories.name`.

Seed rows, when both collections are empty, stay Electronics, Books, and Home, plus Wireless Mouse `$24.50`, Field Guide `$18.00`, and Desk Lamp `$39.00`. Those three products share one `createdAt`. The dashboard does not seed data and does not read a stock, color, weight, image, or rank field.

`MONGODB_URI` remains an environment secret. It is not added to source or `wrangler.toml`. `MONGODB_DB` still defaults to `productmanage`.

## API contracts

The dashboard calls `GET /api/products` once on mount. It does not call `GET /api/categories`. `categoryName` is already on each product. Heart and BUY NOW do not call `fetch`.

Success:

```text
GET /api/products
200 { items: Product[] }

Product = {
  id, name, sku, price, categoryId, categoryName,
  description, createdAt, updatedAt?
}
```

`listProducts` order is `createdAt` descending. Ties are not guaranteed by MongoDB. The client tie-breaks by `id` ascending.

Failure uses the existing error shape. A missing URI is HTTP 500 `{ "error": "MONGODB_URI is not set" }`. Other 500s hide the raw message as `{ "error": "Request failed" }`. The dashboard shows `error.message` in `<p class="message error">`.

These contracts stay as they are. The dashboard does not send them.

| Method | Path | Response |
|---|---|---|
| GET | `/api/products` | `{ items }` |
| POST | `/api/products` | 201 `{ item }` |
| PUT | `/api/products/:id` | `{ item }` |
| DELETE | `/api/products/:id` | `{ deleted: true }` |
| GET | `/api/categories` | `{ items }` including `productCount` |
| POST | `/api/categories` | 201 `{ item }` |
| PUT | `/api/categories/:id` | `{ item }` |
| DELETE | `/api/categories/:id` | `{ deleted: true }` only when `productCount` is 0 |

Page routes:

| Method | Path | Response |
|---|---|---|
| GET | `/` | 302 `Location: /dashboard` on Express and the Worker |
| GET | `/dashboard` | SPA HTML. Express lists the path. The Worker SPA fallback serves `index.html`. |
| GET | `/products`, `/categories` | Unchanged admin HTML |

Express `res.redirect("/dashboard")` is 302. The Worker uses `Response.redirect(new URL("/dashboard", url), 302)`. The target is a fixed path, not request input. `run_worker_first` is not extended.

## Frontend components

State lives in `Dashboard`. Math lives in `catalogView.js`. Panels are controlled and do not recompute bucket bounds.

| Module | Responsibility |
|---|---|
| `web/src/catalogView.js` | Sort ids, price ranges, colors, `productIsInStock`, `matchesColor`, `priceBucket`, `countPriceRanges`, `filterProducts`, `sortProducts`, `activeChips`, `clearChip`, `formatPrice`, `viewCatalog`. No React. |
| `web/src/components/Dashboard.jsx` | `GET /api/products`, cancelled on unmount, filter state, session heart set, `useMemo` around `viewCatalog`. |
| `web/src/components/FilterPanel.jsx` | Sort fieldset, collapsible Availability, Price, and Color. |
| `web/src/components/ProductPanel.jsx` | `<N> items`, chips, featured tile, standard cards, inline SVG placeholder, loading, error, empty, and zero-match copy. |
| `web/src/App.jsx` | Nav order Dashboard, Products, Categories. `/` and `*` navigate to `/dashboard`. `document.title` is `Dashboard`. Admin `<h1>` is omitted on that route. Class `page page-dashboard` only there. |
| `web/src/index.css` | Rules under `.page-dashboard` and `.dashboard`, including the button-padding reset and 5 / 3 / 2 / 1 column breakpoints. |

`viewCatalog(products, state)` returns `items`, `featured` (`items[0]` or `null`), `cards` (`items.slice(1)`), `count` (`items.length`), `priceCounts` from the full argument, and ordered chips. Default sort is `newest`. Availability, Price, and Color start expanded. Collapsing uses `hidden` and does not clear selections.

Price intervals are `[0, 100)`, `[100, 200)`, `[200, 300)`, `[300, 400)`, and `price >= 400`. A non-finite or negative price matches no bucket. With no price checkbox selected it stays visible. `productIsInStock` and `matchesColor` return true. Best Sellers and both Weight sorts copy the fetched order.

The featured tile shows `categoryName` (omitted when empty) and `name`. It has no price, heart, or BUY NOW. Standard cards show the placeholder, heart, uppercase `categoryName`, bold `name`, `$` plus two decimals, and BUY NOW. Text is React children. The placeholder SVG is a source constant with `aria-hidden="true"`.

Chip order is In Stock Only, then selected price ranges in checkbox order, then selected colors in swatch order. Each chip's accessible name is `Remove <label>`.

Layout: side by side at `>= 960px` (5 columns from `1280px`, 3 columns from `960px` through `1279px`); filter stacked above the grid below `960px` (2 columns through `640px`, 1 column below `640px`). Grid tracks are `minmax(0, 1fr)`. The featured tile does not span columns.

## Decisions

### 1. Pure catalog module

Keep bucket bounds and the non-excluding predicates in `catalogView.js` only. UI components receive the view model. Inline filter math in `Dashboard.jsx` was rejected because `node:test` would not cover it without a DOM runner.

### 2. One fetch, memory-only filters

`Dashboard` loads `{ items }` once. Filter changes do not refetch, navigate, or write storage. Unstored controls stay visible and do not hide products. Inferring color or rank from `name` or `sku` was rejected.

### 3. Whole-catalog counts

`priceCounts` is computed from the unfiltered argument. Selecting In Stock Only, a color, or a price range does not change the five numbers.

### 4. Featured split

`count` includes the featured product. The caption style is category and name only.

### 5. Scoped CSS

`body:has(.page-dashboard)` sets the white page. `.dashboard button` resets `padding: 0 16px 4px`. Admin pages keep `.page` at `1100px` and the `#eef2f5` root background.

### 6. Dual runtime, no Worker route list change

Express must list `/dashboard` because it has no SPA fallback. The Worker already serves unknown paths as `index.html`. Both runtimes change only the `/` redirect target.

## Dependencies

No new npm package.

| Package | Where | Use |
|---|---|---|
| `express` ^4.21.2 | root | Local API and HTML routes |
| `mongodb` ^6.18.0 | root | Store |
| `react` ^19.1.1, `react-dom` ^19.1.1 | `web` | UI |
| `react-router-dom` ^7.18.4 | `web` | `/dashboard`, `/products`, `/categories` |
| `vite` ^7.1.5, `@vitejs/plugin-react` ^5.0.2 | `web` | Dev and build |
| `wrangler` ^4.86.0 | root | Worker deploy |

Node `>= 22`. Tests use the built-in `node:test` runner. Root and `web` are `"type": "module"`. `npm test` runs `node --test web/src/catalogView.test.js`.

## Tests

Unit tests in `web/src/catalogView.test.js` are the automated gate:

- Six sort labels, five price labels, and eight color labels, in spec order.
- Half-open boundaries, including `100` in `$100 to $199` and `400` in `$400 and up`.
- Seed prices `24.5`, `18`, and `39` count as `{ below-100: 3, 100-199: 0, 200-299: 0, 300-399: 0, 400-up: 0 }`.
- Price OR, and counts that ignore stock, color, and the selected ranges.
- In-stock and all-colors selections return every input.
- Newest and price sorts, `id` tie-break, non-finite prices last, invalid timestamps last.
- Best Sellers and Weight sorts keep fetched order and do not sort in place.
- Chip order and single-chip removal.
- Featured split: non-empty `count === items.length`; empty `featured === null` and `count === 0`.
- `formatPrice(24.5)` is `$24.50` and `formatPrice(18)` is `$18.00`.

There is no React component test runner. Layout, keyboard names, the single fetch, heart reset, and admin regression are manual on `npm run dev` with `MONGODB_URI` set. Confirm `GET /` is 302 to `/dashboard`, the six sorts, the stock chip, seed counts `3, 0, 0, 0, 0`, eight swatches, the featured tile, 5 / 3 / 2 / 1 columns, `/products` and `/categories` CRUD, the red API error, `0 items` for `$400 and up`, and no request from BUY NOW. Review `src/worker.js` for the same redirect when a Worker preview is not run.

## Security

- No new write route. Dashboard `fetch` is only `GET /api/products`.
- `name`, `categoryName`, `description`, and `sku` render as React text. The placeholder is not a database URL.
- Filter state is not copied into the query string.
- The redirect target is the constant `/dashboard`.
- Adding a page path does not add auth, cookies, or CORS rules. The app has no login gate, and this change does not add one.
- A missing `MONGODB_URI` stays the existing 500 error string.

## Risks / Trade-offs

- **Unstored controls do not narrow the grid.** The spec requires the controls and the non-excluding predicates. Tests lock that behavior.
- **Featured item can be dropped from the count.** `count` includes `featured`. The unit test locks the split.
- **Shared seed timestamps.** Newest tie-breaks by `id` ascending.
- **Admin CSS can leak.** New selectors stay under `.page-dashboard` and `.dashboard`.
- **Heart can be read as a saved wishlist.** State dies with the component. There is no wishlist API.
- **Catalog size.** `useMemo` is enough for the stated size. This change does not add paging.

## Migration Plan

No data migration. Deploy with the existing `npm run build:web` and `npm run deploy` path.

Rollback removes `catalogView.js`, its test, and the three dashboard components; points `/` and `*` back to `/products`; removes `/dashboard` from Express `pagePaths`; restores the README route sentence; and drops the `test` script if it exists only for this feature. Stored products and categories stay valid.

## Open Questions

None. The approved spec settles route, unstored filters, placeholder, featured tile, visible BUY NOW and heart, and whole-catalog price counts.
