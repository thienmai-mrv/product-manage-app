# Proposal

## Why

The application previously offered only administrative CRUD tables (`/products` and `/categories`), lacking a customer-facing storefront view for browsing, sorting, and filtering the catalog. Introducing a storefront Product Dashboard at `/dashboard` (and making it the default `/` landing page) provides an interactive visual catalog experience with a filter sidebar and multi-column product card grid mapped directly onto the existing product and category data model.

## What Changes

- **Landing Route & Navigation**: Add a storefront Dashboard page at `/dashboard`, redirect `GET /` (HTTP 302) and unknown client routes to `/dashboard` in both Express and Cloudflare Worker runtimes, and expose **Dashboard**, **Products**, and **Categories** navigation links while preserving existing administrative pages.
- **Left Filter Panel**: Introduce a sidebar with:
  - **Sort** radio options (`Best Sellers`, `Newest`, `Price:High-Low`, `Price:Low-High`, `Weight:Heavy-Light`, `Weight:Light-Heavy`), ordering stored products by `createdAt` or `price` and preserving fetched catalog order for unstored sort attributes.
  - Collapsible **Availability** section with an `In Stock Only` toggle button (`aria-pressed`, active border, and removable chip) that treats all current catalog products as in stock.
  - Collapsible **Price** section with five non-overlapping range checkboxes (`below $100`, `$100 to $199`, `$200 to $299`, `$300 to $399`, `$400 and up`), right-aligned whole-catalog item counts, and OR-union filtering.
  - Collapsible **Color** section with a 4×2 swatch grid (`Black`, `White`, `Gold`, `Silver`, `Red`, `Blue/Navy`, `Green`, `Yellow`) that emits removable filter chips without excluding products until color data exists on product records.
- **Right Product Panel**:
  - Header displaying `<N> items` and ordered removable filter chips (`In Stock Only`, selected price ranges, selected colors).
  - Responsive multi-column card grid (5 / 3 / 2 / 1 columns across viewport breakpoints) where the first matching product renders as a tall featured tile (`categoryName` + `name` over a black caption panel) and remaining products render as standard cards with an inline SVG placeholder, top-right wishlist heart toggle (`♡`), uppercase `categoryName`, bold `name`, `$XX.XX` price, and full-width `BUY NOW` button.
  - Distinct loading (`Loading products…`), error (`.message.error`), empty catalog (`No products yet.`), and zero-match filter (`No products match the selected filters.`) states.

## Capabilities

### New Capabilities
- `product-dashboard`: Customer-facing storefront dashboard at `/dashboard` (and `/` redirect) providing client-side sorting, availability/price/color filtering with whole-catalog price bucket counts, removable active filter chips, a featured first product tile, and standard product cards with wishlist heart and `BUY NOW` controls.

### Modified Capabilities
<!-- None — existing product-management and category-management CRUD schemas, API contracts, and admin pages remain unchanged. -->

## Impact

- **Frontend Routing & UI**: `web/src/App.jsx`, `web/src/components/Dashboard.jsx`, `web/src/components/FilterPanel.jsx`, `web/src/components/ProductPanel.jsx`, `web/src/catalogView.js`, and scoped storefront styles in `web/src/index.css`.
- **Backend & Worker Routing**: `src/app.js` (`/dashboard` in `pagePaths` and `/` → `/dashboard` 302 redirect) and `src/worker.js` (`/` → `/dashboard` 302 redirect).
- **Testing & Documentation**: `web/src/catalogView.test.js` (`node:test` unit suite wired to `npm test`) and updated route table in `README.md`.
- **Unchanged Systems**: MongoDB collections and schemas (`src/store.js`), `/api/products` and `/api/categories` REST contracts, `/products` and `/categories` admin CRUD screens, and `wrangler.toml`.
