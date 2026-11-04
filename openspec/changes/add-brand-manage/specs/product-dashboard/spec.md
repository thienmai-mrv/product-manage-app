# product-dashboard Specification Delta

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Dashboard route and landing page redirect
The system SHALL serve the storefront Dashboard view at `/dashboard` in both Express and Cloudflare Worker runtimes, redirect `GET /` with HTTP 302 to `/dashboard`, route unknown client paths to `/dashboard`, set `document.title` to `Dashboard`, omit the administrative `<h1>` page header, and render the navigation menu bar in the exact order `Dashboard | Products | Brands | Categories`.

#### Scenario: Root URL redirects to dashboard
- **WHEN** a client requests `GET /` on Express or the Cloudflare Worker
- **THEN** the server responds with HTTP 302 and `Location: /dashboard`

#### Scenario: Dashboard page renders two-column layout
- **WHEN** a user navigates to `/dashboard`
- **THEN** the application renders the navigation menu bar in order `Dashboard | Products | Brands | Categories`, fetches `GET /api/products`, `GET /api/brands`, and `GET /api/categories` once on mount in parallel, sets `document.title` to `Dashboard`, omits the administrative `<h1>` header, and renders the Left Filter Panel alongside the Right Product Panel

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

### Requirement: Result count header and removable active filter chips
The system SHALL display `<N> items` in the product panel header alongside removable filter chips ordered by `In Stock Only`, selected price ranges in checkbox order, selected brands, and selected categories, where activating any chip removes that single filter and updates the grid immediately without refetching.

#### Scenario: Remove active filter via chip click
- **WHEN** a user clicks an active filter chip (accessible name `Remove <label>`) for availability, price range, brand, or category
- **THEN** only that filter selection is cleared, its control state resets, and the product grid and `<N> items` count update immediately in memory

### Requirement: Loading, error, empty catalog, and zero-match filter states
The system SHALL distinguish between initial loading (`Loading products…`), API request failure (`.message.error`), an empty catalog (`No products yet.`), and a filter combination (across availability, price, brand, and category filters) that matches zero products (`0 items` and `No products match the selected filters.`).

#### Scenario: Display API error when product load fails
- **WHEN** `GET /api/products`, `GET /api/brands`, or `GET /api/categories` returns an error (such as HTTP 500 `MONGODB_URI is not set`)
- **THEN** the product panel renders the error message in `<p class="message error">` rather than an empty filter state

#### Scenario: Display zero-match filter message
- **WHEN** products are loaded and the user selects a brand (or combination of brand, category, price, and availability filters) matching zero published products
- **THEN** the product panel header displays `0 items`, the body displays `No products match the selected filters.`, and the sidebar price counts remain unchanged
