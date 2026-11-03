# Proposal: update-product-manage

## Why

Catalog administrators currently can set a product image only by typing an external `http` or `https` URL, and every stored product is immediately visible on the storefront `/dashboard` with no way to hide draft or retired items without deleting them. Supporting both image file upload and image URL entry on `/products`, along with a product publish/unpublish workflow that limits `/dashboard` to published products, gives administrators flexible image management and direct control over storefront visibility.

## What Changes

- **Product Image Selection on `/products`**:
  - Allow an administrator creating or editing a product on `/products` to provide the product image either by uploading an image file or by entering an external `http` or `https` image URL, or leaving the image unset.
  - Validate product image input in both the local Express server (`src/app.js`) and the Cloudflare Worker (`src/worker.js`) via shared validation rules, rejecting invalid image URLs and unsupported or oversized uploaded files with HTTP 400.
  - Render the configured product image (whether set via file upload or URL) in the `/products` table and `/dashboard` product cards, falling back to the existing placeholder when unset or when image loading fails.
- **Product Publish / Unpublish State**:
  - Extend the product model and `/api/products` contract with a publish state so an administrator can publish or unpublish a product from `/products` (during creation, editing, or direct status toggling on the management page).
  - Persist the publish state in MongoDB and return it on product API responses identically across Express and Cloudflare Worker runtimes.
- **Product Stock Status**:
  - Add a boolean `inStock` flag to the product model and `/api/products` contract, applied in the shared store so Express and the Worker behave the same. Omitted on create means in stock. Omitted on update keeps the current value. A stored product with no flag is in stock.
  - Show a Stock column on `/products` and let the administrator toggle it from the row.
- **Admin Page Layout and Actions**:
  - Remove the in-memory cart and `Add to Cart` from `/products`.
  - Replace text row actions with icon buttons (accessible names `Mark in stock` / `Mark out of stock`, `Publish` / `Unpublish`, `Edit`, `Delete`) on `/products`, and the same `Edit` and `Delete` icons on `/categories`.
  - Widen `/products` and `/categories` to a 1600px page. `/dashboard` stays full width.
- **Dashboard Published-Only Visibility and Filters**:
  - Update the `/dashboard` storefront catalog so only published products are eligible for storefront display, `<N> items` result counts, product cards, and sidebar price-range bucket counts.
  - Render every matched product, including the first, as the same standard card. Remove the separate featured caption tile.
  - Make `In Stock Only` exclude products whose `inStock` is `false`.
  - Replace the Color swatch filter with a Categories checkbox filter loaded from `/api/categories`.
  - Reduce the sort options to `Best Sellers`, `Newest`, `Price:High-Low`, and `Price:Low-High`.
  - Keep all products (both published and unpublished) visible and manageable on the `/products` administrative page.

## Capabilities

### New Capabilities
<!-- None — this change extends existing product management and storefront dashboard capabilities. -->

### Modified Capabilities
- `product-management`: Add product image file upload alongside image URL entry, persist and expose product publish state and `inStock` status in `/api/products`, provide publish, stock, and image file/URL controls on `/products` as icon actions, and remove the admin cart.
- `product-dashboard`: Restrict `/dashboard` catalog display, result counts, and price bucket counts to published products only, render every product as a standard card, apply `inStock` to `In Stock Only`, replace the Color filter with a Categories filter, and drop the Weight sorts.

## Impact

- **Backend & Shared Store**: `src/productInput.js`, `src/store.js`, `src/routes/products.js`, `src/app.js`, and `src/worker.js` (product schema fields, image upload/URL handling, publish and stock persistence, and Express/Worker runtime parity).
- **Frontend Admin & Storefront**: `web/src/components/Products.jsx` (file upload + URL input, publish and stock icon actions, Status and Stock columns, no cart), `web/src/components/Categories.jsx` and `web/src/components/ActionIcon.jsx` (shared icon actions), `web/src/App.jsx` and `web/src/index.css` (1600px admin pages), `web/src/components/Dashboard.jsx`, `web/src/components/FilterPanel.jsx`, `web/src/components/ProductPanel.jsx`, and `web/src/catalogView.js` (filtering out unpublished products before counting, sorting, and rendering, plus the stock and category filters).
- **Tests & Specs**: `web/src/catalogView.test.js`, `src/productInput.test.js`, and OpenSpec specs under `openspec/specs/product-management/spec.md` and `openspec/specs/product-dashboard/spec.md`.

## Assumptions

- No authentication or role-based access control is introduced in this change; "administrator" refers to the user operating `/products`.
- Both Express (`src/app.js`) and Cloudflare Worker (`src/worker.js`) runtimes must expose identical API contracts, status codes, and validation error formats.
- Clearing or omitting both the uploaded file and image URL leaves the product with an empty `imageUrl` (`""`), which renders the existing placeholder.
- `inStock` is a manual flag set by the administrator. It is independent of `quantity`.

## Open questions

1. **Upload storage mechanism**: Where should uploaded product images be stored and served so they work identically in both the local Express server and the Cloudflare Worker (for example, inline base64 data URLs stored in MongoDB, a MongoDB binary/collection endpoint, Cloudflare R2 / object storage, or another storage backend)?
2. **Allowed image file types**: Which image MIME types and file extensions should be accepted for uploaded product images (for example, PNG, JPEG, WebP, GIF, SVG)?
3. **Upload file size limits**: What is the maximum allowed file size for an uploaded product image (and if stored as a data URL or in MongoDB, what size limit replaces or coexists with the current 2048-character `imageUrl` limit)?
4. **Default publish state for existing and starter products**: Should existing product documents in MongoDB that lack a publish field (as well as newly seeded starter products and newly created products when not explicitly specified) default to published or unpublished?
5. **Dashboard empty state when only unpublished products exist**: When the catalog contains products in MongoDB but zero products are published, should `/dashboard` display `No products yet.` (treating the published storefront catalog as empty) or `0 items` with a different message?
