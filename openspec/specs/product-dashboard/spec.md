# product-dashboard Specification

## Purpose

Provides the customer-facing storefront Product Dashboard at `/dashboard` (and the default `/` landing redirect) with a Left Filter Panel (Sort, Availability, Price ranges with whole-catalog counts, and Color swatches) and a Right Product Panel (matched item count, removable filter chips, featured first product tile, and standard product cards with wishlist heart and `BUY NOW` controls).

## Requirements

### Requirement: Dashboard route and landing page redirect
The system SHALL publicly serve the storefront Dashboard view at `/dashboard` without requiring login in both Express and Cloudflare Worker runtimes, redirect `GET /` with HTTP 302 to `/dashboard`, route unknown client paths to `/dashboard`, set `document.title` to `Dashboard`, omit the administrative `<h1>` page header, and render the navigation menu bar in the exact order `Dashboard | Products | Brands | Categories`.

#### Scenario: Root URL redirects to dashboard
- **WHEN** a client requests `GET /` on Express or the Cloudflare Worker
- **THEN** the server responds with HTTP 302 and `Location: /dashboard`

#### Scenario: Dashboard page renders two-column layout
- **WHEN** an authenticated or unauthenticated user navigates to `/dashboard`
- **THEN** the application renders the navigation menu bar in order `Dashboard | Products | Brands | Categories`, fetches `GET /api/products`, `GET /api/brands`, and `GET /api/categories` once on mount in parallel, sets `document.title` to `Dashboard`, omits the administrative `<h1>` header, and renders the Left Filter Panel alongside the Right Product Panel

### Requirement: Sort radio controls and catalog ordering
The system SHALL render a non-collapsible `Sort` section with six radio options in exact order (`Best Sellers`, `Newest`, `Price:High-Low`, `Price:Low-High`, `Weight:Heavy-Light`, `Weight:Light-Heavy`), defaulting to `Newest` (`createdAt` descending with `id` ascending tie-break), ordering by numeric `price` for price sorts (`id` ascending tie-break, non-finite prices last), and preserving fetched catalog order for `Best Sellers` and `Weight` options.

#### Scenario: Sort by Price Low-High and High-Low
- **WHEN** a user selects `Price:Low-High` or `Price:High-Low`
- **THEN** the product grid reorders matching products by ascending or descending `price` respectively, breaking ties by `id` ascending without mutating the fetched array

#### Scenario: Sort by Newest
- **WHEN** the dashboard loads initially or the user selects `Newest`
- **THEN** the product grid orders matching products by `createdAt` descending with `id` ascending tie-breaking and places missing or invalid timestamps last

#### Scenario: Sort by unstored attributes restores fetched order
- **WHEN** a user switches from a price sort to `Best Sellers`, `Weight:Heavy-Light`, or `Weight:Light-Heavy`
- **THEN** the product grid restores the original fetched array order without hiding any products

### Requirement: Collapsible Availability filter control
The system SHALL render a collapsible `Availability` section containing an `In Stock Only` toggle button that updates `aria-pressed`, displays a dark `#000000` border when active, adds a removable `In Stock Only ×` chip to the product panel header, and supports collapsing/expanding across the `Availability`, `Price`, `Brands`, and `Categories` filter sections.

#### Scenario: Activate In Stock Only filter
- **WHEN** a user activates the `In Stock Only` button
- **THEN** the button sets `aria-pressed="true"`, an `In Stock Only ×` chip appears in the product panel header, and published products with `inStock: false` are excluded from the grid and `<N> items`

#### Scenario: Collapse and expand filter section
- **WHEN** a user clicks the collapse toggle button on the `Availability`, `Price`, `Brands`, or `Categories` section header
- **THEN** the section header updates `aria-expanded` and hides or reveals the section's controls via the `hidden` attribute while preserving active filter selections

### Requirement: Price range checkboxes and whole-catalog bucket counts
The system SHALL render a collapsible `Price` section with five checkboxes (`below $100` for `[0, 100)`, `$100 to $199` for `[100, 200)`, `$200 to $299` for `[200, 300)`, `$300 to $399` for `[300, 400)`, and `$400 and up` for `>= 400`), displaying right-aligned item counts computed across all published products in the loaded catalog and filtering displayed products by the OR union of selected price ranges.

#### Scenario: Filter products by selected price buckets
- **WHEN** a user selects one or more price range checkboxes
- **THEN** the product grid displays only published products whose `price` falls within any selected interval, adds a removable chip for each selected range, and updates the `<N> items` header count

#### Scenario: Whole-catalog price counts ignore active filters
- **WHEN** a user activates `In Stock Only`, selects brands, selects categories, or checks price ranges
- **THEN** the numeric item counts beside each of the five price checkboxes remain fixed to the totals across all published products in the loaded catalog

### Requirement: Collapsible Color swatch grid
The system SHALL render a collapsible `Color` section with eight toggleable color swatches in a 4×2 grid (`Black`, `White`, `Gold`, `Silver`, `Red`, `Blue/Navy`, `Green`, `Yellow`) that reflect selection via `aria-pressed` and emit removable filter chips without excluding catalog products.

#### Scenario: Toggle color swatch selection
- **WHEN** a user clicks a color swatch such as `Black`
- **THEN** the swatch sets `aria-pressed="true"`, a `Black ×` chip appears in the product panel header, and all products matching active price ranges remain visible

### Requirement: Result count header and removable active filter chips
The system SHALL display `<N> items` in the product panel header alongside removable filter chips ordered by `In Stock Only`, selected price ranges in checkbox order, selected brands, and selected categories, where activating any chip removes that single filter and updates the grid immediately without refetching.

#### Scenario: Remove active filter via chip click
- **WHEN** a user clicks an active filter chip (accessible name `Remove <label>`) for availability, price range, brand, or category
- **THEN** only that filter selection is cleared, its control state resets, and the product grid and `<N> items` count update immediately in memory

### Requirement: Featured first tile and standard product cards
The system SHALL render the first matched product as a tall featured tile (`aspect-ratio: 3 / 4` placeholder over a `#000000` caption with uppercase `categoryName` and `name`, without price, heart, or `BUY NOW`) and subsequent matched products as standard cards (`aspect-ratio: 1 / 1` `#f5f5f5` well, placeholder SVG, top-right heart button, uppercase `categoryName`, bold `name`, `$XX.XX` price, and full-width `#000000` `BUY NOW` button).

#### Scenario: Render featured first tile and standard cards
- **WHEN** one or more products match the active filters
- **THEN** `items[0]` renders as the tall featured caption tile, `items.slice(1)` render as standard product cards with `$XX.XX` formatted prices, and `<N> items` equals the total count including the featured product

### Requirement: Responsive multi-column card grid layout
The system SHALL arrange the product card grid into 5 columns at `>= 1280px`, 3 columns at `960px–1279px`, 2 columns with the filter panel stacked above at `640px–959px`, and 1 column with the filter panel stacked above at `< 640px`.

#### Scenario: Adapt layout across viewport breakpoints
- **WHEN** the viewport width is resized across `>= 1280px`, `960px–1279px`, `640px–959px`, and `< 640px`
- **THEN** the product card grid adjusts to 5, 3, 2, and 1 columns respectively, and the filter panel stacks above the product panel below `960px`

### Requirement: Interactive wishlist heart and BUY NOW card controls
The system SHALL provide accessible `type="button"` controls on every standard card for the wishlist heart (`Save <name>` / `Remove <name> from wishlist`) and `BUY NOW` (`Buy <name> now`), where clicking the heart toggles in-memory `aria-pressed` state for that session and clicking `BUY NOW` or the heart triggers no navigation or network request.

#### Scenario: Toggle wishlist heart and click BUY NOW
- **WHEN** a user clicks the wishlist heart or `BUY NOW` button on a standard product card
- **THEN** the heart toggles its `aria-pressed` and filled icon state in component memory, `BUY NOW` performs no navigation or API call, and reloading the page resets the heart state

### Requirement: Loading, error, empty catalog, and zero-match filter states
The system SHALL distinguish between initial loading (`Loading products…`), API request failure (`.message.error`), an empty catalog (`No products yet.`), and a filter combination (across availability, price, brand, and category filters) that matches zero products (`0 items` and `No products match the selected filters.`).

#### Scenario: Display API error when product load fails
- **WHEN** `GET /api/products`, `GET /api/brands`, or `GET /api/categories` returns an error (such as HTTP 500 `MONGODB_URI is not set`)
- **THEN** the product panel renders the error message in `<p class="message error">` rather than an empty filter state

#### Scenario: Display zero-match filter message
- **WHEN** products are loaded and the user selects a brand (or combination of brand, category, price, and availability filters) matching zero published products
- **THEN** the product panel header displays `0 items`, the body displays `No products match the selected filters.`, and the sidebar price counts remain unchanged

### Requirement: Collapsible Brands checkbox filter before Categories filter
The system SHALL render a collapsible `Brands` filter section immediately before the `Categories` filter section in the `/dashboard` left filter panel, displaying one checkbox per brand loaded from `GET /api/brands` and filtering displayed products by the OR union of selected brands (`brandId`). When no brand is selected, brand does not exclude products; when no brands exist, the section shows `No brands yet.`

#### Scenario: Render Brands filter section before Categories filter section
- **WHEN** a user views the left filter panel on `/dashboard`
- **THEN** the collapsible `Brands` filter section is rendered after `Price` and immediately before the `Categories` filter section

#### Scenario: Filter products by selected brands
- **WHEN** a user checks one or more brand checkboxes in the `Brands` filter section
- **THEN** the product grid displays only published products whose `brandId` matches any selected brand (combined with active availability, price, and category filters), adds a removable chip labeled with each selected brand name before any category chips, and updates `<N> items` without refetching

#### Scenario: No brand selected
- **WHEN** no brand checkbox is checked
- **THEN** the brand filter does not exclude any published product

### Requirement: Login and Logout controls on the Dashboard page
The system SHALL render an accessible `Login` button on `/dashboard` when unauthenticated that navigates to `/login`, and render a `Logout` control when authenticated that signs the administrator out and keeps `/dashboard` open.

#### Scenario: Unauthenticated visitor sees Login button on Dashboard
- **WHEN** an unauthenticated user loads `/dashboard`
- **THEN** the Dashboard page renders a visible `Login` control alongside the storefront view without blocking catalog rendering

#### Scenario: Activating Login button on Dashboard navigates to /login
- **WHEN** an unauthenticated user clicks or activates the `Login` control on `/dashboard`
- **THEN** the browser navigates to `/login` and renders the administrator Login page

#### Scenario: Authenticated administrator logs out from Dashboard and stays on Dashboard
- **WHEN** a logged-in administrator views `/dashboard` and activates the `Logout` control
- **THEN** the session is cleared, `/dashboard` remains open for public browsing, and the `Login` button is displayed again

### Requirement: Unauthenticated public access to Dashboard
The system SHALL allow users who are not logged in to view `/dashboard`, fetch catalog products, brands, and categories, and interact with all client-side sorting, filtering, removable chips, and session wishlist controls without authenticating.

#### Scenario: Unauthenticated visitor browses and filters Dashboard catalog
- **WHEN** a user who is not logged in navigates to `/dashboard`
- **THEN** the page loads `GET /api/products`, `GET /api/brands`, and `GET /api/categories` with HTTP 200 and lets the user sort, filter by availability, price, brand, and category, remove chips, and toggle wishlist hearts without redirecting to `/login`

#### Scenario: Root redirect lands unauthenticated visitor on Dashboard
- **WHEN** an unauthenticated user requests `GET /` or opens `/` in the browser
- **THEN** the user is redirected to `/dashboard` and views the storefront catalog without being prompted to log in
