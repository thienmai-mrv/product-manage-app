# Proposal: update-product-manage

## Why

Catalog administrators currently can set a product image only by typing an external `http` or `https` URL, and every stored product is immediately visible on the storefront `/dashboard` with no way to hide draft or retired items without deleting them. Supporting both image file upload and image URL entry on `/products`, along with a product publish/unpublish workflow that limits `/dashboard` to published products, gives administrators flexible image management and direct control over storefront visibility.

## What Changes

- **Product Image Selection on `/products`**:
  - Allow an administrator creating or editing a product on `/products` to provide the product image either by uploading an image file or by entering an external `http` or `https` image URL, or leaving the image unset.
  - Validate product image input in both the local Express server (`src/app.js`) and the Cloudflare Worker (`src/worker.js`) via shared validation rules, rejecting invalid image URLs and unsupported or oversized uploaded files with HTTP 400.
  - Render the configured product image (whether set via file upload or URL) in the `/products` table, in-memory cart, and `/dashboard` product cards, falling back to the existing placeholder when unset or when image loading fails.
- **Product Publish / Unpublish State**:
  - Extend the product model and `/api/products` contract with a publish state so an administrator can publish or unpublish a product from `/products` (during creation, editing, or direct status toggling on the management page).
  - Persist the publish state in MongoDB and return it on product API responses identically across Express and Cloudflare Worker runtimes.
- **Dashboard Published-Only Visibility**:
  - Update the `/dashboard` storefront catalog so only published products are eligible for storefront display, `<N> items` result counts, featured first tile selection, standard product cards, and sidebar price-range bucket counts.
  - Keep all products (both published and unpublished) visible and manageable on the `/products` administrative page.

## Capabilities

### New Capabilities
<!-- None — this change extends existing product management and storefront dashboard capabilities. -->

### Modified Capabilities
- `product-management`: Add product image file upload alongside image URL entry, persist and expose product publish/unpublish state in `/api/products`, and provide publish/unpublish and image file/URL controls on `/products`.
- `product-dashboard`: Restrict `/dashboard` catalog display, result counts, featured tile selection, and price bucket counts to published products only.

## Impact

- **Backend & Shared Store**: `src/store.js`, `src/routes/products.js`, `src/app.js`, and `src/worker.js` (product schema fields, image upload/URL handling, publish state persistence, and Express/Worker runtime parity).
- **Frontend Admin & Storefront**: `web/src/components/Products.jsx` (file upload + URL input, publish/unpublish controls and status display), `web/src/components/Dashboard.jsx`, `web/src/components/ProductPanel.jsx`, and `web/src/catalogView.js` (filtering out unpublished products before counting, sorting, and rendering).
- **Tests & Specs**: `web/src/catalogView.test.js` and OpenSpec specs under `openspec/specs/product-management/spec.md` and `openspec/specs/product-dashboard/spec.md`.

## Assumptions

- No authentication or role-based access control is introduced in this change; "administrator" refers to the user operating `/products`.
- Both Express (`src/app.js`) and Cloudflare Worker (`src/worker.js`) runtimes must expose identical API contracts, status codes, and validation error formats.
- Clearing or omitting both the uploaded file and image URL leaves the product with an empty `imageUrl` (`""`), which renders the existing placeholder.

## Open questions

1. **Upload storage mechanism**: Where should uploaded product images be stored and served so they work identically in both the local Express server and the Cloudflare Worker (for example, inline base64 data URLs stored in MongoDB, a MongoDB binary/collection endpoint, Cloudflare R2 / object storage, or another storage backend)?
2. **Allowed image file types**: Which image MIME types and file extensions should be accepted for uploaded product images (for example, PNG, JPEG, WebP, GIF, SVG)?
3. **Upload file size limits**: What is the maximum allowed file size for an uploaded product image (and if stored as a data URL or in MongoDB, what size limit replaces or coexists with the current 2048-character `imageUrl` limit)?
4. **Default publish state for existing and starter products**: Should existing product documents in MongoDB that lack a publish field (as well as newly seeded starter products and newly created products when not explicitly specified) default to published or unpublished?
5. **Dashboard empty state when only unpublished products exist**: When the catalog contains products in MongoDB but zero products are published, should `/dashboard` display `No products yet.` (treating the published storefront catalog as empty) or `0 items` with a different message?
