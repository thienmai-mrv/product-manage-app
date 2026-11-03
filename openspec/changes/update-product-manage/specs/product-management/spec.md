# product-management Specification Delta

## ADDED Requirements

### Requirement: Set product image by file upload or URL
The system SHALL allow an administrator on `/products` and through `/api/products` (`POST /api/products` and `PUT /api/products/:id`) to set a product image either by uploading an image file or by entering an external `http` or `https` image URL, or to leave the product without an image (`imageUrl` as `""`). Both Express and Cloudflare Worker runtimes MUST validate and persist the resulting product image identically.

#### Scenario: Set product image by uploading a valid file
- **WHEN** an administrator selects a valid image file in the product form on `/products` and saves the product
- **THEN** the system accepts the uploaded image, stores the product image reference on the product record, returns it in `{ item }`, and renders the uploaded image in the `/products` table

#### Scenario: Set product image by entering an http or https URL
- **WHEN** an administrator enters a valid external `http` or `https` URL in the product form on `/products` and saves the product
- **THEN** the system stores the trimmed URL on the product record, returns it in `{ item }`, and the browser renders the image from that URL

#### Scenario: Switch product image between uploaded file and URL on edit
- **WHEN** an administrator edits an existing product and replaces an uploaded image with a valid `http` or `https` URL (or replaces a URL with a valid uploaded image file) and saves
- **THEN** the system updates the product's stored image to the newly selected source and returns the updated `{ item }` with `updatedAt` set

#### Scenario: Reject invalid uploaded image file or invalid image URL
- **WHEN** a client submits `POST /api/products` or `PUT /api/products/:id` with an unsupported or oversized image file, or an image URL that is neither empty nor a valid `http`/`https` URL
- **THEN** the system rejects the request with HTTP 400 and `{ "error": "<message>" }` without creating or modifying the product

### Requirement: Publish and unpublish a product
The system SHALL store a publish state on each product and allow an administrator on `/products` and through `/api/products` to publish or unpublish a product across both Express and Cloudflare Worker runtimes.

#### Scenario: Publish a product from the products management page
- **WHEN** an administrator publishes an unpublished product on `/products` (or creates/updates a product as published)
- **THEN** the system persists the product in the published state via `/api/products`, updates the row on `/products` to show the product as published, and makes the product eligible to appear on `/dashboard`

#### Scenario: Unpublish a product from the products management page
- **WHEN** an administrator unpublishes a published product on `/products` (or creates/updates a product as unpublished)
- **THEN** the system persists the product in the unpublished state via `/api/products`, keeps the product visible in the `/products` administrative table as unpublished, and excludes the product from `/dashboard`

#### Scenario: Attempt to change publish state of a non-existent product
- **WHEN** a client sends an update to publish or unpublish a product `id` that does not exist
- **THEN** the system responds with HTTP 404 and `{ "error": "Product not found" }`

### Requirement: Product stock status
The system SHALL store a boolean `inStock` flag on each product, identically in Express and the Cloudflare Worker. An omitted `inStock` on create stores `true`. An omitted `inStock` on update keeps the current value, which is `false` only when the stored value is boolean `false`. A present `inStock` that is not a boolean is rejected with HTTP 400 `{ "error": "Stock status must be true or false" }`. A stored product with no `inStock` flag is returned as `inStock: true`.

#### Scenario: Toggle stock status from the products management page
- **WHEN** an administrator clicks the `Mark out of stock` or `Mark in stock` action on a product row on `/products`
- **THEN** the page sends `PUT /api/products/:id` with the flipped `inStock` boolean and the product's current fields and image, and the row's Stock column updates to `Out of Stock` or `In Stock`

#### Scenario: Omitted stock status
- **WHEN** a client sends `POST /api/products` without `inStock`, or `PUT /api/products/:id` without `inStock`
- **THEN** the created product has `inStock: true`, and the updated product keeps its current stock status

#### Scenario: Reject a non-boolean stock status
- **WHEN** a client sends `POST /api/products` or `PUT /api/products/:id` with `inStock` set to a non-boolean value such as `"false"` or `null`
- **THEN** the system responds with HTTP 400 and `{ "error": "Stock status must be true or false" }`

## MODIFIED Requirements

### Requirement: List products with resolved category names
The system SHALL return all products ordered by `createdAt` descending from `GET /api/products` as `{ items }`, where each item includes `id`, `name`, `sku`, `price`, `categoryId`, resolved `categoryName`, `description`, `imageUrl`, `quantity`, `published`, `inStock`, `createdAt`, and optional `updatedAt`. `imageUrl` is an empty string when the product has no image. `quantity` is a whole number and is `0` when an older document has no quantity. `published` and `inStock` are `true` unless the stored value is boolean `false`.

#### Scenario: Fetch products from catalog
- **WHEN** a client sends `GET /api/products`
- **THEN** the system responds with HTTP 200 and `{ items }` ordered by `createdAt` descending with each product's `categoryName` populated from its category and its publish state and stock status included

#### Scenario: Seed starter products on first request
- **WHEN** a client sends `GET /api/products` and both `categories` and `products` collections are empty
- **THEN** the system inserts the starter categories and starter products (`Wireless Mouse`, `Field Guide`, `Desk Lamp`) as published and in stock before returning the list

### Requirement: Create product with validated fields
The system SHALL create a product via `POST /api/products` requiring a non-empty trimmed `name`, an existing `categoryId`, a finite non-negative numeric `price` rounded to two decimal places, and a whole-number `quantity` that is zero or greater, along with optional trimmed `sku`, `description`, product image (via uploaded file or `http`/`https` `imageUrl`), `published` state, and `inStock` status.

#### Scenario: Create valid product
- **WHEN** a client sends `POST /api/products` with a valid `name`, existing `categoryId`, non-negative `price`, whole-number `quantity`, and optional `sku`, `description`, image (file upload or `imageUrl`), `published` state, and `inStock` status
- **THEN** the system stores the product with a generated UUID `id` and `createdAt` timestamp and responds with HTTP 201 and `{ item }`

#### Scenario: Reject product with missing name or invalid category
- **WHEN** a client sends `POST /api/products` with a blank `name` or a `categoryId` that does not match an existing category
- **THEN** the system responds with HTTP 400 and an error message (`"Name is required"`, `"Category is required"`, or `"Category not found"`)

#### Scenario: Reject product with negative or non-numeric price
- **WHEN** a client sends `POST /api/products` with a negative or non-finite `price`
- **THEN** the system responds with HTTP 400 and `{ "error": "Price must be a number that is zero or greater" }`

#### Scenario: Reject product with an invalid image or quantity
- **WHEN** a client sends `POST /api/products` with an invalid image URL or invalid uploaded image file, or a quantity that is negative or not a whole number
- **THEN** the system responds with HTTP 400 and a validation error message in `{ "error": "<message>" }`

### Requirement: Update existing product
The system SHALL update an existing product's `name`, `sku`, `price`, `categoryId`, `description`, `imageUrl` (from an uploaded image file or URL), `quantity`, `published` state, `inStock` status, and `updatedAt` timestamp via `PUT /api/products/:id` using the same field validations as product creation.

#### Scenario: Update product fields
- **WHEN** a client sends `PUT /api/products/:id` for an existing product with valid fields (including updated image, `published` state, or `inStock` status)
- **THEN** the system updates the product document, sets `updatedAt`, and responds with HTTP 200 and `{ item }`

#### Scenario: Update non-existent product
- **WHEN** a client sends `PUT /api/products/:id` for an `id` that does not exist
- **THEN** the system responds with HTTP 404 and `{ "error": "Product not found" }`

### Requirement: Products administrative UI
The system SHALL serve the `/products` administrative page in both Express and Cloudflare Worker runtimes, at a page width of up to 1600px, displaying all products (both published and unpublished) in a product table (`No`, `Name`, `SKU`, `Category`, `Price`, `Image`, `Quantity`, `Description`, `Status`, `Stock`, `Action`) with inline add, edit (with image file upload or image URL entry), publish/unpublish, stock toggle, and confirmed delete workflows. The Status column shows `Published` or `Unpublished`. The Stock column shows `Out of Stock` when `inStock` is `false` and `In Stock` otherwise. Row actions are icon buttons whose accessible name and tooltip are `Mark in stock` or `Mark out of stock`, `Publish` or `Unpublish`, `Edit`, and `Delete`. The page has no cart.

#### Scenario: View and manage products on admin page
- **WHEN** an administrator navigates to `/products`
- **THEN** the page loads `/api/products` and `/api/categories` in parallel, renders the product table with prices formatted to two decimal places, shows each product's image, quantity, publish status, and stock status, and provides `Add` plus the row icon actions for stock, publish, edit, and delete

#### Scenario: Delete a product after confirmation
- **WHEN** an administrator clicks the `Delete` icon on a product row
- **THEN** the page asks for confirmation and, only after the administrator confirms, sends `DELETE /api/products/:id` and removes the row
