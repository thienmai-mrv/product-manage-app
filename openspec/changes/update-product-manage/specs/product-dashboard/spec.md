# product-dashboard Specification Delta

## ADDED Requirements

### Requirement: Display only published products on dashboard
The system SHALL include only published products in the `/dashboard` storefront catalog, excluding unpublished products from the product grid, product cards, `<N> items` result count, and sidebar price-range bucket counts.

#### Scenario: Show published products and hide unpublished products on dashboard
- **WHEN** the catalog contains both published and unpublished products and a user views `/dashboard`
- **THEN** only published products appear as product cards, `<N> items` counts only matching published products, and sidebar price bucket counts include only published products

#### Scenario: Unpublishing a product removes it from dashboard on next load
- **WHEN** an administrator unpublishes a previously published product on `/products` and a user loads `/dashboard`
- **THEN** the unpublished product is not rendered as a card and is not counted in `<N> items` or price bucket totals

#### Scenario: Publishing an unpublished product shows it on dashboard on next load
- **WHEN** an administrator publishes a previously unpublished product on `/products` and a user loads `/dashboard`
- **THEN** the newly published product is included in `/dashboard` filtering, sorting, `<N> items` count, price bucket counts, and card rendering

#### Scenario: Render uploaded or URL product image on dashboard card
- **WHEN** a published product has an image set via file upload or an external `http`/`https` image URL and is displayed on `/dashboard`
- **THEN** the product card renders that product image, or falls back to the placeholder SVG when the product has no image or the image fails to load

### Requirement: Collapsible Categories checkbox filter
The system SHALL render a collapsible `Categories` section with one checkbox per category loaded from `GET /api/categories`, filtering displayed published products by the OR union of selected categories (`categoryId`). With no category selected, category does not exclude products. When no categories are loaded, the section shows `No categories yet.`

#### Scenario: Filter products by selected categories
- **WHEN** a user checks one or more category checkboxes
- **THEN** the product grid displays only published products whose `categoryId` matches any selected category, a removable chip labeled with each selected category name appears in the product panel header, and `<N> items` updates without refetching

#### Scenario: No category selected
- **WHEN** no category checkbox is checked
- **THEN** category does not exclude any published product

### Requirement: Standard product cards for every matched product
The system SHALL render every matched product, including the first, as the same standard card (`aspect-ratio: 1 / 1` `#f5f5f5` image well with the product image or placeholder SVG, top-right heart button, uppercase `categoryName`, bold `name`, `$XX.XX` price, and full-width `#000000` `BUY NOW` button). There is no separate featured caption tile.

#### Scenario: Render all matched products as standard cards
- **WHEN** one or more products match the active filters
- **THEN** every matched product, including the first, renders as a standard product card with a `$XX.XX` formatted price, and `<N> items` equals the number of rendered cards

## MODIFIED Requirements

### Requirement: Dashboard route and landing page redirect
The system SHALL serve the storefront Dashboard view at `/dashboard` in both Express and Cloudflare Worker runtimes, redirect `GET /` with HTTP 302 to `/dashboard`, route unknown client paths to `/dashboard`, set `document.title` to `Dashboard`, omit the administrative `<h1>` page header, keep the dashboard full width, and preserve navigation to `/products` and `/categories`.

#### Scenario: Root URL redirects to dashboard
- **WHEN** a client requests `GET /` on Express or the Cloudflare Worker
- **THEN** the server responds with HTTP 302 and `Location: /dashboard`

#### Scenario: Dashboard page renders two-column layout
- **WHEN** a user navigates to `/dashboard`
- **THEN** the application fetches `GET /api/products` and `GET /api/categories` once on mount in parallel, sets `document.title` to `Dashboard`, omits the administrative `<h1>` header, and renders the Left Filter Panel alongside the Right Product Panel

### Requirement: Sort radio controls and catalog ordering
The system SHALL render a non-collapsible `Sort` section with four radio options in exact order (`Best Sellers`, `Newest`, `Price:High-Low`, `Price:Low-High`), defaulting to `Newest` (`createdAt` descending with `id` ascending tie-break), ordering by numeric `price` for price sorts (`id` ascending tie-break, non-finite prices last), and preserving fetched catalog order for `Best Sellers`.

#### Scenario: Sort by Price Low-High and High-Low
- **WHEN** a user selects `Price:Low-High` or `Price:High-Low`
- **THEN** the product grid reorders matching products by ascending or descending `price` respectively, breaking ties by `id` ascending without mutating the fetched array

#### Scenario: Sort by Newest
- **WHEN** the dashboard loads initially or the user selects `Newest`
- **THEN** the product grid orders matching products by `createdAt` descending with `id` ascending tie-breaking and places missing or invalid timestamps last

#### Scenario: Sort by unstored attributes restores fetched order
- **WHEN** a user switches from a price sort to `Best Sellers`
- **THEN** the product grid restores the original fetched array order without hiding any products

### Requirement: Collapsible Availability filter control
The system SHALL render a collapsible `Availability` section containing an `In Stock Only` toggle button that updates `aria-pressed`, displays a dark `#000000` border when active, adds a removable `In Stock Only ×` chip to the product panel header, and, while active, excludes products whose `inStock` is boolean `false`. A product with a missing `inStock` flag is treated as in stock. `quantity` is not used by this filter.

#### Scenario: Activate In Stock Only filter
- **WHEN** a user activates the `In Stock Only` button
- **THEN** the button sets `aria-pressed="true"`, an `In Stock Only ×` chip appears in the product panel header, and published products with `inStock: false` are hidden from the grid and from `<N> items`

#### Scenario: Collapse and expand filter section
- **WHEN** a user clicks the collapse toggle button on the `Availability`, `Price`, or `Categories` section header
- **THEN** the section header updates `aria-expanded` and hides or reveals the section's controls via the `hidden` attribute while preserving active filter selections

### Requirement: Price range checkboxes and whole-catalog bucket counts
The system SHALL render a collapsible `Price` section with five checkboxes (`below $100` for `[0, 100)`, `$100 to $199` for `[100, 200)`, `$200 to $299` for `[200, 300)`, `$300 to $399` for `[300, 400)`, and `$400 and up` for `>= 400`), displaying right-aligned item counts computed across all published products in the loaded catalog and filtering displayed published products by the OR union of selected price ranges.

#### Scenario: Filter products by selected price buckets
- **WHEN** a user selects one or more price range checkboxes
- **THEN** the product grid displays only published products whose `price` falls within any selected interval, adds a removable chip for each selected range, and updates the `<N> items` header count

#### Scenario: Whole-catalog price counts ignore active filters
- **WHEN** a user activates `In Stock Only`, selects categories, or checks price ranges
- **THEN** the numeric item counts beside each of the five price checkboxes remain fixed to the totals across all published products in the loaded catalog

### Requirement: Result count header and removable active filter chips
The system SHALL display `<N> items` in the product panel header alongside removable filter chips ordered by `In Stock Only`, selected price ranges in checkbox order, and selected categories, where activating any chip removes that single filter and updates the grid immediately without refetching.

#### Scenario: Remove active filter via chip click
- **WHEN** a user clicks an active filter chip (accessible name `Remove <label>`)
- **THEN** only that filter selection is cleared, its control state resets, and the product grid and `<N> items` count update immediately in memory

### Requirement: Loading, error, empty catalog, and zero-match filter states
The system SHALL distinguish between initial loading (`Loading products…`), API request failure (`.message.error`), an empty published catalog (`No products yet.`), and a filter combination that matches zero published products (`0 items` and `No products match the selected filters.`).

#### Scenario: Display API error when product load fails
- **WHEN** `GET /api/products` or `GET /api/categories` returns an error (such as HTTP 500 `MONGODB_URI is not set`)
- **THEN** the product panel renders the error message in `<p class="message error">` rather than an empty filter state

#### Scenario: Display empty catalog message when no published products exist
- **WHEN** `GET /api/products` succeeds and there are zero published products
- **THEN** the product panel displays `No products yet.` and `0 items`

#### Scenario: Display zero-match filter message
- **WHEN** published products are loaded and the user selects a price range containing zero published products
- **THEN** the product panel header displays `0 items`, the body displays `No products match the selected filters.`, and the sidebar price counts remain unchanged

## REMOVED Requirements

### Requirement: Collapsible Color swatch grid
**Reason**: The color swatches never excluded products. The dashboard now filters by category instead.
**Migration**: Use the `Categories` checkbox filter described in `Collapsible Categories checkbox filter`.

### Requirement: Featured first tile and standard product cards
**Reason**: The first matched product no longer renders as a tall caption tile. Every product uses the same card.
**Migration**: See `Standard product cards for every matched product`.
