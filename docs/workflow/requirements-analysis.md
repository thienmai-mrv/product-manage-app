# Requirements Analysis: Product Dashboard with Filter Panel and Card Grid

## Task Summary

Design and specify a storefront-style Product Dashboard for `product-manage-app` (on branch `feature/cart`) modeled after the provided reference screenshot (`orca-paste-1793590675268-35266977-44ab-41ec-89b7-f1478ecdfef7.png`). The dashboard introduces a two-column layout consisting of a **Left Filter Panel** (Sort, Availability, Price ranges with counts, and Color swatches) and a **Right Product Panel** (result count header with removable active-filter chips and a multi-column product card grid featuring a highlighted first tile and standard product cards with wishlist heart and `BUY NOW` controls), mapped onto the application's existing product and category catalog without inventing unapproved schema fields.

---

## Current Behavior

### Routing & Navigation
- **Backend (`src/app.js` & `src/worker.js`)**:
  - `GET /` responds with an HTTP `302` redirect to `/products`.
  - Express serves the SPA entry point (`web/index.html`) only for `pagePaths = ["/products", "/categories"]`.
  - API routes are mounted at `/api/products` (`GET`, `POST`, `PUT /:id`, `DELETE /:id`) and `/api/categories` (`GET`, `POST`, `PUT /:id`, `DELETE /:id`).
- **Frontend (`web/src/App.jsx`)**:
  - Renders a top `<header className="header">` with a dynamic `<h1>` page title (`"Products"` or `"Categories"`) and a `<nav className="nav">` containing two `NavLink` tabs: **Products** (`/products`) and **Categories** (`/categories`).
  - Catch-all route (`*`) redirects to `/products` via `<Navigate to="/products" replace />`.
  - There is no `/dashboard` route, no storefront view, no filter sidebar, no product card grid, and no cart or wishlist state.

### Product & Category Screens
- **Products Screen (`web/src/components/Products.jsx`)**:
  - Fetches `/api/products` and `/api/categories` in parallel on mount using `requestJson`.
  - Displays an **Add** button in `.toolbar`, an inline add/edit `<form className="config-form">` (fields: `Name`, `SKU`, `Price`, `Category`, `Description`), and an admin HTML table (`.config-table.product-table`) with columns `No`, `Name`, `SKU`, `Category`, `Price` (formatted via `Number(price).toFixed(2)` without a `$` symbol), `Description` (single-line ellipsis), and `Action` (`Edit`, `Delete`).
  - Displays `"No products yet."` when the catalog is empty, or an `.error` banner if the API request fails (e.g., `"MONGODB_URI is not set"` when `.env` is unconfigured).
- **Categories Screen (`web/src/components/Categories.jsx`)**:
  - Fetches `/api/categories` on mount.
  - Displays an **Add** button, an inline add/edit form (fields: `Name`, `Description`), and an admin table (`.config-table.category-table`) with columns `No`, `Name`, `Description`, `Products` (`productCount`), and `Action` (`Edit`, `Delete`).

### Stored Data Model (`src/store.js`)
- **Products (`products` collection)**:
  - Stored fields: `_id` (string), `name` (required string), `sku` (optional string), `price` (required non-negative number rounded to 2 decimal places), `categoryId` (required string referencing `categories._id`), `description` (optional string), `createdAt` (ISO 8601 timestamp string), and optional `updatedAt` (ISO 8601 timestamp string).
  - API serialization (`toProduct`): `{ id, name, sku, price, categoryId, categoryName, description, createdAt, updatedAt? }`.
  - Seed data (`ensureSeed`):
    1. `Wireless Mouse` (`sku: "EL-100"`, `price: 24.5`, `categoryId: "cat-electronics"`, `description: "Compact Bluetooth mouse"`)
    2. `Field Guide` (`sku: "BK-015"`, `price: 18`, `categoryId: "cat-books"`, `description: "Illustrated pocket guide"`)
    3. `Desk Lamp` (`sku: "HM-220"`, `price: 39`, `categoryId: "cat-home"`, `description: "Adjustable LED lamp"`)
- **Categories (`categories` collection)**:
  - Stored fields: `_id` (string), `name` (required unique case-insensitive string), `description` (optional string), `createdAt` (ISO 8601 timestamp), optional `updatedAt`.
  - API serialization (`toCategory`): `{ id, name, description, createdAt, updatedAt?, productCount }`.
- **Missing Fields Relative to Reference Screenshot**:
  - The catalog does **not** store product `image` (URL/asset), `stock` / availability status, `color`, `weight`, `brand` (distinct from `categoryName`), or `bestSeller` / sales rank metrics.

---

## Desired Behavior

Provide a Dashboard view matching the visual structure and interaction patterns of the reference screenshot while mapping onto `product-manage-app`'s catalog data:

### 1. Left Filter Panel
Positioned on the left side of the dashboard, separated from the product panel by a vertical divider line, with horizontal dividers between sections and collapsible (`-`) section headers on Availability, Price, and Color:
- **Sort Section**:
  - Radio button list allowing single selection among six options in exact screenshot order:
    1. `Best Sellers`
    2. `Newest`
    3. `Price:High-Low` (Price High-Low)
    4. `Price:Low-High` (Price Low-High)
    5. `Weight:Heavy-Light` (Weight Heavy-Light)
    6. `Weight:Light-Heavy` (Weight Light-Heavy)
- **Availability Section**:
  - Section header `Availability` with collapse control (`-`).
  - Selectable button/toggle `In Stock Only` (with dark border when active).
- **Price Section**:
  - Section header `Price` with collapse control (`-`).
  - Five checkbox rows, each displaying the price tier label on the left and the matching item count right-aligned:
    1. `below $100`
    2. `$100 to $199`
    3. `$200 to $299`
    4. `$300 to $399`
    5. `$400 and up`
- **Color Section**:
  - Section header `Color` with collapse control (`-`).
  - 4-column × 2-row swatch grid of square color tiles with text labels beneath each tile:
    - Row 1: `Black`, `White`, `Gold`, `Silver`
    - Row 2: `Red`, `Blue/Navy`, `Green`, `Yellow`

### 2. Right Product Panel Header
- Displays the total count of currently matched products on the left (formatted as `<N> items`, e.g., `203 items`).
- Displays removable active-filter chips beside the item count for each active filter (e.g., `In Stock Only ×`), where clicking a chip or its `×` icon removes that active filter and updates the product grid and counts.

### 3. Right Product Panel Body (Card Grid)
- Multi-column responsive card grid (5 columns per row on wide desktop viewports in the reference screenshot).
- **First Tile (Featured / Highlighted Tile)**:
  - Positioned in the first slot of the grid, featuring a larger product image area on top of a solid black caption panel at the bottom displaying uppercase title/category text and subtitle/description text (matching the `MR-G` / `BLUE ROSE` tile in the screenshot).
- **Standard Product Cards**:
  - Each card displays:
    - A light gray top image container with a wishlist heart icon (`♡`) in the top-right corner and a centered product image (or catalog placeholder when no image exists).
    - **Collection or Brand line**: Uppercase smaller label mapped from the catalog's `categoryName` (unless a dedicated `brand` field is introduced).
    - **Model Name line**: Bold heading mapped from the product's `name` (or `sku` / `name` combination per catalog mapping).
    - **Price line**: Currency-formatted price `$<price>` with two decimal places (e.g., `$110.00`).
    - **BUY NOW Control**: Full-width black button at the bottom of the card with uppercase white text `BUY NOW` and a shopping cart/bag icon.

### 4. Catalog Mapping Summary

| Screenshot Element | Catalog Mapping in `product-manage-app` | Status / Gap |
|---|---|---|
| Card Collection / Brand (`G-SHOCK`) | `product.categoryName` | Mapped to existing `categoryName` (or `brand` if added; see Open Questions) |
| Card Model Name (`DW5600UBB-1`) | `product.name` (and/or `product.sku`) | Mapped to `name` (`sku` available as secondary/model code) |
| Card Price (`$110.00`) | `product.price` formatted as `$XX.XX` | Mapped directly to `price` |
| First Tile Caption (`MR-G` / `BLUE ROSE`) | First product's `categoryName` + `name`/`description`, or static/featured banner | Needs product owner confirmation (see Open Questions) |
| Sort: `Newest` | `product.createdAt` descending (`sort({ createdAt: -1 })`) | Mapped directly to `createdAt` |
| Sort: `Price:High-Low` / `Price:Low-High` | `product.price` descending / ascending | Mapped directly to `price` |
| Sort: `Best Sellers` | Not stored in `products` | Missing field — requires fallback order or schema addition |
| Sort: `Weight:Heavy-Light` / `Weight:Light-Heavy` | Not stored in `products` | Missing `weight` field — requires open question resolution |
| Filter: `In Stock Only` | Not stored in `products` | Missing `inStock` / `stock` field — requires open question resolution |
| Filter: `Price` checkboxes + counts | `product.price` bucketed into `<100`, `100–199.99`, `200–299.99`, `300–399.99`, `>=400` | Mapped directly to `price` |
| Filter: `Color` swatches | Not stored in `products` | Missing `color` field — requires open question resolution |
| Card Image | Not stored in `products` | Missing `image` field — requires placeholder or schema addition |
| Card `BUY NOW` & Heart (`♡`) actions | No cart or wishlist store currently implemented | Behaviour on click requires clarification (branch is `feature/cart`) |

---

## Functional Requirements

- **FR-1: Dashboard Route and Navigation**
  - Expose the Dashboard view in the React application and Express/Worker page routes (either as the new `/` landing page alongside `/products` and `/categories`, or at `/dashboard` per resolution of Open Question OQ-1).
  - Fetch catalog products from `GET /api/products` (and categories from `GET /api/categories` if needed) when rendering the dashboard.

- **FR-2: Left Filter Panel — Sort Control**
  - Render a `Sort` section with six radio options: `Best Sellers`, `Newest`, `Price:High-Low`, `Price:Low-High`, `Weight:Heavy-Light`, and `Weight:Light-Heavy`.
  - Selecting `Newest` orders displayed products by `createdAt` descending.
  - Selecting `Price:High-Low` orders displayed products by `price` descending; `Price:Low-High` orders by `price` ascending.
  - Selecting `Best Sellers`, `Weight:Heavy-Light`, or `Weight:Light-Heavy` applies the defined fallback or field-based sort once missing-field handling is confirmed (see OQ-2, OQ-3).

- **FR-3: Left Filter Panel — Availability Control**
  - Render a collapsible `Availability` section containing an `In Stock Only` toggle button.
  - Toggling `In Stock Only` marks the button active (black border), adds an `In Stock Only ×` chip to the product panel header, and filters the displayed products according to availability rules (see OQ-2).

- **FR-4: Left Filter Panel — Price Range Checkboxes with Counts**
  - Render a collapsible `Price` section with five checkboxes and right-aligned product counts:
    - `below $100`: `0 <= price < 100`
    - `$100 to $199`: `100 <= price < 200` (or `<= 199.99`)
    - `$200 to $299`: `200 <= price < 300` (or `<= 299.99`)
    - `$300 to $399`: `300 <= price < 400` (or `<= 399.99`)
    - `$400 and up`: `price >= 400`
  - Selecting one or more price checkboxes filters the product grid to products matching the union (OR) of selected price ranges and adds corresponding removable filter chips to the product panel header.
  - Display the count of catalog products falling into each price bucket next to each checkbox label.

- **FR-5: Left Filter Panel — Color Swatches**
  - Render a collapsible `Color` section with 8 color swatches in a 4×2 grid: `Black`, `White`, `Gold`, `Silver`, `Red`, `Blue/Navy`, `Green`, and `Yellow`.
  - Selecting/deselecting a color swatch updates the active filter chips and filters products according to the resolved color mapping strategy (see OQ-2).

- **FR-6: Product Panel Header — Result Count and Removable Filter Chips**
  - Render `<count> items` reflecting the number of products currently matching active filters.
  - Render a removable chip (`<Filter Label> ×`) for each active filter (e.g., `In Stock Only ×`, selected price ranges, selected colors).
  - Clicking a chip or its `×` button removes that filter and immediately updates the result count and card grid.

- **FR-7: Product Panel Body — Card Grid and First Featured Tile**
  - Render products in a multi-column card grid (5 columns per row on desktop viewports).
  - Render the first tile in the larger featured style shown in the screenshot (tall image area above a solid black caption block) if enabled by the resolved first-tile rule (see OQ-4).
  - Render standard product cards with:
    - Top gray image panel containing a product image (or fallback artwork) and a top-right wishlist heart button (`♡`).
    - Collection/brand text (`categoryName` or `brand`).
    - Model/product name (`name` / `sku`).
    - Price formatted as `$<price.toFixed(2)>`.
    - Black full-width `BUY NOW` button with cart/bag icon.

- **FR-8: Card Interactions (`BUY NOW` and Wishlist Heart)**
  - Provide interactive `BUY NOW` and heart (`♡`) controls on each standard product card with behavior conforming to the scope confirmed in OQ-5 (e.g., visual toggle state / cart action vs. UI-only control).

- **FR-9: Empty, Loading, and Error States**
  - Display a clear message when `/api/products` fails to load (consistent with `.message.error` in `Products.jsx`) or when zero products match the currently selected filters.

---

## Non-Functional Requirements

- **NFR-1: Visual Fidelity to Reference Screenshot**
  - Typography, monochrome palette (white page background, `#f5f5f5` card image wells, `#000000` primary buttons and featured tile caption, subtle gray borders), spacing, and 5-column desktop grid proportions must match the reference screenshot.
- **NFR-2: Responsive Layout**
  - On wide desktop screens (`>= 1280px`), display the left filter sidebar alongside a 5-column product card grid; gracefully step down column counts on narrower viewports so cards do not overflow horizontally.
- **NFR-3: Client-Side Filter & Sort Responsiveness**
  - Filtering, sorting, price bucket counting, and chip removal over the loaded catalog should execute without full page reloads and update the UI within `< 50ms` for typical catalog sizes (`<= 500` items).
- **NFR-4: Accessibility**
  - All filter controls (radio buttons, checkboxes, `In Stock Only` toggle, color swatches, collapsible section headers, removable filter chips, wishlist buttons, and `BUY NOW` buttons) must be keyboard-operable and carry accessible labels.
- **NFR-5: Dual Runtime Compatibility**
  - Any new page route or API change must work identically in both the local Express server (`src/app.js`) and the Cloudflare Worker runtime (`src/worker.js`).

---

## Affected Components

| Layer | File / Module | Expected Impact |
|---|---|---|
| Frontend Routing & Shell | `web/src/App.jsx` | Add Dashboard route/navigation and layout container adjustments (current `.page` has `max-width: 1100px` and `#eef2f5` background, whereas the dashboard screenshot uses a wide full-bleed white layout). |
| Frontend Dashboard UI | `web/src/components/Dashboard.jsx` (new) or `web/src/components/Products.jsx` | Implement Left Filter Panel (Sort, Availability, Price with counts, Color swatches), Product Panel Header (item count + removable chips), and Product Card Grid (featured first tile + standard product cards). |
| Frontend Styles | `web/src/index.css` | Add styles for the two-column dashboard layout, filter sidebar, radio/checkbox/swatch controls, active filter chips, 5-column card grid, featured first tile, and product cards (`BUY NOW` button, wishlist heart icon). |
| Express Server Routing | `src/app.js` | Update `pagePaths` and `/` redirect if the dashboard is served at `/` or `/dashboard`. |
| Cloudflare Worker Routing | `src/worker.js` | Update `/` redirect and SPA asset handling if route paths change. |
| Data Store & API (Conditional) | `src/store.js`, `src/routes/products.js`, `web/src/components/Products.jsx` | Only modified **if** stakeholders decide to expand the product schema/seed data with `image`, `inStock`/`stock`, `color`, `weight`, or `brand` (pending Open Questions). |

---

## Assumptions and Dependencies

### Explicit Assumptions
1. **A-1 (Catalog Field Mapping)**: Unless the product schema is explicitly extended, each card's collection/brand label maps to `product.categoryName`, the model name maps to `product.name` (with `product.sku` optionally shown or used as model code), price maps to `product.price`, and `Newest` sort maps to `product.createdAt` descending.
2. **A-2 (Missing Product Attributes)**: Because `products` in `src/store.js` currently store only `name`, `sku`, `price`, `categoryId`, `description`, and `createdAt`, attributes shown in the screenshot (`image`, `stock`/availability, `color`, `weight`, `brand`, `bestSeller`) are not present in existing database records and require either schema extension, derived/default values, or UI-only filter controls as decided by the product owner.
3. **A-3 (Price Bucket Boundaries)**: Continuous decimal prices (`0.01` step) are bucketed into five non-overlapping ranges: `< $100.00`, `$100.00–$199.99`, `$200.00–$299.99`, `$300.00–$399.99`, and `>= $400.00`.
4. **A-4 (Existing Admin Screens Preserved)**: The existing `/products` and `/categories` CRUD management screens remain accessible so administrators can continue creating, editing, and deleting catalog items.

### Dependencies
- **D-1**: MongoDB connection (`MONGODB_URI` in `.env` for local Express or `.dev.vars` / Worker secret for Cloudflare Workers) is required for `/api/products` and `/api/categories` to return live catalog data (currently `http://localhost:3000/api/products` returns `500 {"error":"MONGODB_URI is not set"}` when `.env` is absent).
- **D-2**: React Router (`react-router-dom` `^7.8.2`) for client-side routing between the Dashboard, Products, and Categories views.

---

## Open Questions

The following critical ambiguities and missing-data gaps require stakeholder / coordinator clarification before or during architectural planning:

1. **OQ-1 (Dashboard Route & Navigation Placement)**:
   - Should the new Dashboard be rendered at `/` (or `/dashboard`) as a new top-level navigation tab alongside **Products** and **Categories**, or should it replace the table view on `/products` (with admin CRUD moved or toggled)?
2. **OQ-2 (Missing Filter & Sort Data Fields: `stock`, `color`, `weight`, `bestSeller`)**:
   - The database schema (`src/store.js`) only stores `name`, `sku`, `price`, `categoryId`, and `description`. How should filters and sorts that depend on unstored attributes behave?
     - **Option A (No Schema Change / Client Fallback)**: Keep the existing schema; treat all existing products as `In Stock` by default, render Color swatches and Weight/Best Seller sorts as UI state (either no-op, metadata-derived, or matching none when a color filter is selected), and only actively filter/sort by `Price` and `Newest`.
     - **Option B (Extend Product Schema & Seed Data)**: Add optional/required fields (`image`, `inStock`/`stock`, `color`, `weight`, `brand`, `isBestSeller`) to `src/store.js` and the product add/edit form so all filters and sorts operate on stored fields.
3. **OQ-3 (Product Image Source)**:
   - Since products have no `image` field, should cards render a generated watch/product SVG placeholder (or static sample images), or should an `imageUrl` field be added to the product model?
4. **OQ-4 (First Featured Tile Behavior)**:
   - In the reference screenshot, the first grid cell is a promotional/featured tile (`MR-G` / `BLUE ROSE`) with an image over a solid black caption and no price or `BUY NOW` button. Should the first cell in the grid:
     - Render the first matching catalog product in this featured card style (showing `categoryName` and `name`/`description` in the black caption), **or**
     - Render a static promotional banner tile preceding the catalog product cards, **or**
     - Include price and `BUY NOW` inside/below the black caption for the first catalog product?
5. **OQ-5 (`BUY NOW` and Wishlist Heart `♡` Actions)**:
   - Given the branch name `feature/cart`, should clicking `BUY NOW` and the heart icon (`♡`) trigger local UI state only (e.g., toggle filled heart icon, show feedback/counter), or is a functional shopping cart / wishlist drawer expected in this task?
6. **OQ-6 (Price Bucket Count Calculation)**:
   - Should the count displayed next to each Price checkbox (`below $100`, `$100 to $199`, etc.) reflect the total number of products in that price range across the entire catalog, or the count after applying other active filters (`In Stock Only`, `Color`)?

---

## Measurable Acceptance Criteria

- **AC-1 (Dashboard Rendering & Layout)**:
  - Navigating to the dashboard route renders a two-column layout with the **Left Filter Panel** and **Right Product Panel** without console or runtime errors.
- **AC-2 (Sort Options Completeness & Behavior)**:
  - The `Sort` section renders exactly 6 radio options: `Best Sellers`, `Newest`, `Price:High-Low`, `Price:Low-High`, `Weight:Heavy-Light`, and `Weight:Light-Heavy`.
  - Selecting `Price:Low-High` sorts displayed product cards in ascending order of `product.price`; selecting `Price:High-Low` sorts them in descending order of `product.price`; selecting `Newest` sorts them in descending order of `product.createdAt`.
- **AC-3 (Availability Filter & Active Filter Chip)**:
  - The `Availability` section renders an `In Stock Only` control.
  - When `In Stock Only` is active, an `In Stock Only ×` chip appears in the product panel header next to the `<N> items` count; clicking `×` on the chip deactivates the filter and removes the chip.
- **AC-4 (Price Range Checkboxes & Counts)**:
  - The `Price` section renders exactly 5 checkboxes labeled `below $100`, `$100 to $199`, `$200 to $299`, `$300 to $399`, and `$400 and up`, each displaying a numeric item count aligned to the right.
  - Selecting `below $100` filters the product grid so only products with `price < 100` are shown (e.g., the 3 default seed products at `$24.50`, `$18.00`, and `$39.00`), and the header result count updates to match the number of visible product cards.
- **AC-5 (Color Swatches Completeness)**:
  - The `Color` section renders 8 color swatches in a 4×2 grid labeled `Black`, `White`, `Gold`, `Silver`, `Red`, `Blue/Navy`, `Green`, and `Yellow`.
- **AC-6 (Product Card Grid & First Tile Structure)**:
  - The product panel body renders a multi-column card grid where:
    - The first tile renders in the featured style with an image area above a solid black caption block.
    - Every standard product card renders an image container, a top-right heart icon (`♡`), the collection/brand label (`categoryName`), the model/product name (`name`), the price formatted as `$XX.XX`, and a black `BUY NOW` button containing a cart/bag icon.
- **AC-7 (No Regression to Existing Catalog CRUD)**:
  - Existing `/products` and `/categories` management views and `/api/products` and `/api/categories` endpoints continue to function without regression.

---

## Human approval

Approved on 2026-11-02. The Solution Architect must treat these decisions as confirmed and must not reopen them as assumptions:

1. Add a Dashboard page at `/dashboard` and make it the landing page. Keep the Products and Categories admin pages.
2. Show every filter from the screenshot. Apply price sort and newest sort to stored data. Treat current products as in stock. Leave color, weight, and best-seller controls visible without hiding products until those fields exist.
3. Use a placeholder when a product has no image. Do not add an image field in this pass.
4. Render the first matching product as the large featured tile.
5. Show BUY NOW and the heart as visible controls. Do not build a cart in this pass.
6. Price counts are totals for the whole loaded catalog, not counts after other filters.
