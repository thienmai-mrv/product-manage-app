# Spec Delta

## Purpose

Provides the customer-facing storefront Product Dashboard at `/dashboard` (and the default `/` landing redirect) with a Left Filter Panel (Sort, Availability, Price ranges with whole-catalog counts, and Color swatches) and a Right Product Panel (matched item count, removable filter chips, featured first product tile, and standard product cards with wishlist heart and `BUY NOW` controls).

## ADDED Requirements

### Requirement: Dashboard route and landing page redirect
The system SHALL serve the storefront Dashboard view at `/dashboard` in both Express and Cloudflare Worker runtimes, redirect `GET /` with HTTP 302 to `/dashboard`, route unknown client paths to `/dashboard`, set `document.title` to `Dashboard`, omit the administrative `<h1>` page header, and preserve navigation to `/products` and `/categories`.

#### Scenario: Root URL redirects to dashboard
- **WHEN** a client requests `GET /` on Express or the Cloudflare Worker
- **THEN** the server responds with HTTP 302 and `Location: /dashboard`

#### Scenario: Dashboard page renders two-column layout
- **WHEN** a user navigates to `/dashboard`
- **THEN** the application fetches `GET /api/products` once on mount, sets `document.title` to `Dashboard`, omits the administrative `<h1>` header, and renders the Left Filter Panel alongside the Right Product Panel

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
The system SHALL render a collapsible `Availability` section containing an `In Stock Only` toggle button that updates `aria-pressed`, displays a dark `#000000` border when active, adds a removable `In Stock Only ×` chip to the product panel header, and treats all current catalog products as in stock.

#### Scenario: Activate In Stock Only filter
- **WHEN** a user activates the `In Stock Only` button
- **THEN** the button sets `aria-pressed="true"`, an `In Stock Only ×` chip appears in the product panel header, and all loaded catalog products remain eligible for display

#### Scenario: Collapse and expand filter section
- **WHEN** a user clicks the collapse toggle button on the `Availability`, `Price`, or `Color` section header
- **THEN** the section header updates `aria-expanded` and hides or reveals the section's controls via the `hidden` attribute while preserving active filter selections

### Requirement: Price range checkboxes and whole-catalog bucket counts
The system SHALL render a collapsible `Price` section with five checkboxes (`below $100` for `[0, 100)`, `$100 to $199` for `[100, 200)`, `$200 to $299` for `[200, 300)`, `$300 to $399` for `[300, 400)`, and `$400 and up` for `>= 400`), displaying right-aligned item counts computed from the entire loaded catalog and filtering displayed products by the OR union of selected price ranges.

#### Scenario: Filter products by selected price buckets
- **WHEN** a user selects one or more price range checkboxes
- **THEN** the product grid displays only products whose `price` falls within any selected interval, adds a removable chip for each selected range, and updates the `<N> items` header count

#### Scenario: Whole-catalog price counts ignore active filters
- **WHEN** a user activates `In Stock Only`, selects color swatches, or checks price ranges
- **THEN** the numeric item counts beside each of the five price checkboxes remain fixed to the totals across the full loaded catalog

### Requirement: Collapsible Color swatch grid
The system SHALL render a collapsible `Color` section with eight toggleable color swatches in a 4×2 grid (`Black`, `White`, `Gold`, `Silver`, `Red`, `Blue/Navy`, `Green`, `Yellow`) that reflect selection via `aria-pressed` and emit removable filter chips without excluding catalog products.

#### Scenario: Toggle color swatch selection
- **WHEN** a user clicks a color swatch such as `Black`
- **THEN** the swatch sets `aria-pressed="true"`, a `Black ×` chip appears in the product panel header, and all products matching active price ranges remain visible

### Requirement: Result count header and removable active filter chips
The system SHALL display `<N> items` in the product panel header alongside removable filter chips ordered by `In Stock Only`, selected price ranges in checkbox order, and selected colors in swatch order, where activating any chip removes that single filter and updates the grid immediately without refetching.

#### Scenario: Remove active filter via chip click
- **WHEN** a user clicks an active filter chip (accessible name `Remove <label>`)
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
The system SHALL distinguish between initial loading (`Loading products…`), API request failure (`.message.error`), an empty catalog (`No products yet.`), and a filter combination that matches zero products (`0 items` and `No products match the selected filters.`).

#### Scenario: Display API error when product load fails
- **WHEN** `GET /api/products` returns an error (such as HTTP 500 `MONGODB_URI is not set`)
- **THEN** the product panel renders the error message in `<p class="message error">` rather than an empty filter state

#### Scenario: Display zero-match filter message
- **WHEN** products are loaded and the user selects a price range containing zero products
- **THEN** the product panel header displays `0 items`, the body displays `No products match the selected filters.`, and the sidebar price counts remain unchanged
