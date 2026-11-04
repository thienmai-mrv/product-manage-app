# Proposal: add-brand-manage

## Why

Products in the catalog are currently organized and filtered by category, but administrators have no way to manage product brands, assign a brand to a product, or allow storefront visitors on `/dashboard` to filter products by brand. Adding first-class brand management (`/brands` and `/api/brands` seeded with sample brands from Dien May Xanh), product brand selection on `/products`, and a Brand filter before the Categories filter on `/dashboard` gives administrators and shoppers complete brand organization across the catalog.

## What Changes

- **Brand Management (`/brands` and `/api/brands`)**:
  - Add a `brands` MongoDB collection and `/api/brands` REST endpoints (`GET /api/brands`, `POST /api/brands`, `PUT /api/brands/:id`, `DELETE /api/brands/:id`) in both the local Express server (`src/app.js`, `src/routes/brands.js`) and the Cloudflare Worker (`src/worker.js`) backed by shared validation and persistence in `src/store.js`.
  - Enforce required trimmed `name`, optional trimmed `description`, case-insensitive name uniqueness (`{ locale: "en", strength: 2 }`), computed `productCount`, and a deletion guard (HTTP 409 when any product references the brand), matching category management behavior.
  - Seed sample brands from `https://www.dienmayxanh.com` (such as Samsung, Sony, LG, Panasonic, Toshiba, Apple, Electrolux, Daikin, Sharp, Casper) when initializing sample catalog data.
  - Add the `/brands` administrative page (`web/src/components/Brands.jsx`) at up to 1600px width with a brand table (`No`, `Name`, `Description`, `Products`, `Action`) and inline add, edit, and confirmed delete workflows.
- **Navigation Menu Bar Order**:
  - Update the top navigation bar across the application (`web/src/App.jsx`) and Express page routes (`src/app.js`) so the menu bar order is `Dashboard | Products | Brands | Categories` (`/dashboard`, `/products`, `/brands`, `/categories`).
- **Product Brand Selection and Column on `/products`**:
  - Extend the product model and `/api/products` contract (`GET /api/products`, `POST /api/products`, `PUT /api/products/:id`) with `brandId` and resolved `brandName`, validating brand selection the same way category selection is validated.
  - Update `/products` (`web/src/components/Products.jsx`) to load `/api/brands` alongside products and categories, display a `Brand` column in the products table, and provide a `Brand` select control in the product add/edit form the same way a product chooses a category.
- **Dashboard Brand Filter Before Category Filter**:
  - Update `/dashboard` (`web/src/components/Dashboard.jsx`, `web/src/components/FilterPanel.jsx`, `web/src/catalogView.js`) to fetch `GET /api/brands`, render a collapsible `Brands` checkbox filter section immediately before the `Categories` filter section, filter published products by the OR union of selected brands (`brandId`), and emit removable brand filter chips before category chips in the product panel header.

## Capabilities

### New Capabilities
- `brand-management`: Brand catalog storage, case-insensitive unique name validation, product count computation, deletion protection, `/api/brands` REST endpoints in Express and Cloudflare Worker, Dien May Xanh sample brand seeding, and the `/brands` administrative UI.

### Modified Capabilities
- `product-management`: Add `brandId` and resolved `brandName` to product records and `/api/products` responses, validate `brandId` on product create and update, add the `Brand` column and brand selector to `/products`, and load `/api/brands` on the products admin page.
- `product-dashboard`: Update navigation menu bar order to `Dashboard | Products | Brands | Categories`, fetch `/api/brands` on `/dashboard`, add a collapsible `Brands` checkbox filter before the `Categories` filter in the left filter panel, filter published products by selected brands, and render removable brand filter chips before category chips.

## Impact

- **Backend & Shared Store**: `src/store.js`, `src/routes/brands.js` (new), `src/routes/products.js`, `src/app.js` (`/api/brands` and `/brands` in `pagePaths`), and `src/worker.js` (`/api/brands` routing and Express/Worker parity).
- **Frontend Admin & Storefront**: `web/src/App.jsx` (menu order `Dashboard | Products | Brands | Categories`, `/brands` route and title), `web/src/components/Brands.jsx` (new), `web/src/components/Products.jsx` (`Brand` column and form select), `web/src/components/Dashboard.jsx`, `web/src/components/FilterPanel.jsx`, and `web/src/catalogView.js` (`brandIds` filter state, collapsible `Brands` section before `Categories`, and active filter chips).
- **Tests & Specs**: `web/src/catalogView.test.js` and OpenSpec specs under `openspec/changes/add-brand-manage/specs/`.

## Assumptions

- Brand CRUD rules mirror category CRUD rules: trimmed non-empty `name`, optional trimmed `description`, case-insensitive uniqueness via collation `{ locale: "en", strength: 2 }`, computed `productCount`, and blocking deletion with HTTP 409 when products reference the brand.
- Both Express (`src/app.js`) and Cloudflare Worker (`src/worker.js`) runtimes expose identical `/api/brands` and `/api/products` contracts, status codes, and error payloads, and no secrets (`MONGODB_URI`) are placed in source or `wrangler.toml`.
- On `/dashboard`, selecting multiple brands filters products by the OR union of `brandId`, and combining brand filters with category, price, and availability filters applies AND across filter groups.

## Open questions

1. **Exact Dien May Xanh sample brand list and seeding condition**: Which exact set of brands from `https://www.dienmayxanh.com` (for example, `Samsung`, `LG`, `Sony`, `Panasonic`, `Toshiba`, `Apple`, `Electrolux`, `Daikin`, `Sharp`, `Casper`) should be seeded as sample data, and should sample brands be seeded whenever the `brands` collection is empty (even if `categories` and `products` are already populated) or only when the entire catalog is empty?
2. **Default brand for starter and existing products**: Which sample brand should each seeded starter product (`Wireless Mouse`, `Field Guide`, `Desk Lamp`) reference, and how should existing product documents in MongoDB that do not yet have a `brandId` be handled on read and during inline row actions (such as stock or publish toggles)?
3. **Required vs. optional brand on product create/update**: Must every product create (`POST /api/products`) and update (`PUT /api/products/:id`) require a valid existing `brandId` (returning HTTP 400 `"Brand is required"` when blank and `"Brand not found"` when unknown, identical to `categoryId`), or can a product be saved without a brand if existing products lack one?
4. **Brand column position on `/products`**: Should the new `Brand` column on `/products` appear immediately before `Category` (`No`, `Name`, `SKU`, `Brand`, `Category`, ...) to match the `Brands | Categories` menu and filter order, or immediately after `Category`?
5. **Brand display on `/dashboard` product cards**: Should product cards on `/dashboard` continue showing only `categoryName` above the product name, or should they also display `brandName`?
