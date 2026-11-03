# product-dashboard Specification Delta

## ADDED Requirements

### Requirement: Display only published products on dashboard
The system SHALL include only published products in the `/dashboard` storefront catalog, excluding unpublished products from the product grid, featured first tile, standard product cards, `<N> items` result count, and sidebar price-range bucket counts.

#### Scenario: Show published products and hide unpublished products on dashboard
- **WHEN** the catalog contains both published and unpublished products and a user views `/dashboard`
- **THEN** only published products appear in the featured tile and standard product cards, `<N> items` counts only matching published products, and sidebar price bucket counts include only published products

#### Scenario: Unpublishing a product removes it from dashboard on next load
- **WHEN** an administrator unpublishes a previously published product on `/products` and a user loads `/dashboard`
- **THEN** the unpublished product is not rendered in the featured tile or standard cards and is not counted in `<N> items` or price bucket totals

#### Scenario: Publishing an unpublished product shows it on dashboard on next load
- **WHEN** an administrator publishes a previously unpublished product on `/products` and a user loads `/dashboard`
- **THEN** the newly published product is included in `/dashboard` filtering, sorting, `<N> items` count, price bucket counts, and card rendering

#### Scenario: Render uploaded or URL product image on dashboard card
- **WHEN** a published product has an image set via file upload or image URL and is displayed on `/dashboard`
- **THEN** the featured tile or standard product card renders that product image, or falls back to the placeholder SVG when the product has no image or the image fails to load

## MODIFIED Requirements

### Requirement: Price range checkboxes and whole-catalog bucket counts
The system SHALL render a collapsible `Price` section with five checkboxes (`below $100` for `[0, 100)`, `$100 to $199` for `[100, 200)`, `$200 to $299` for `[200, 300)`, `$300 to $399` for `[300, 400)`, and `$400 and up` for `>= 400`), displaying right-aligned item counts computed across all published products in the loaded catalog and filtering displayed published products by the OR union of selected price ranges.

#### Scenario: Filter products by selected price buckets
- **WHEN** a user selects one or more price range checkboxes
- **THEN** the product grid displays only published products whose `price` falls within any selected interval, adds a removable chip for each selected range, and updates the `<N> items` header count

#### Scenario: Whole-catalog price counts ignore active filters
- **WHEN** a user activates `In Stock Only`, selects color swatches, or checks price ranges
- **THEN** the numeric item counts beside each of the five price checkboxes remain fixed to the totals across all published products in the loaded catalog

### Requirement: Loading, error, empty catalog, and zero-match filter states
The system SHALL distinguish between initial loading (`Loading products…`), API request failure (`.message.error`), an empty published catalog (`No products yet.`), and a filter combination that matches zero published products (`0 items` and `No products match the selected filters.`).

#### Scenario: Display API error when product load fails
- **WHEN** `GET /api/products` returns an error (such as HTTP 500 `MONGODB_URI is not set`)
- **THEN** the product panel renders the error message in `<p class="message error">` rather than an empty filter state

#### Scenario: Display empty catalog message when no published products exist
- **WHEN** `GET /api/products` succeeds and there are zero published products
- **THEN** the product panel displays `No products yet.` and `0 items`

#### Scenario: Display zero-match filter message
- **WHEN** published products are loaded and the user selects a price range containing zero published products
- **THEN** the product panel header displays `0 items`, the body displays `No products match the selected filters.`, and the sidebar price counts remain unchanged
