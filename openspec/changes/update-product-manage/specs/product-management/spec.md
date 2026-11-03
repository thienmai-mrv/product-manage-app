# product-management Specification Delta

## ADDED Requirements

### Requirement: Set product image by file upload or URL
The system SHALL allow an administrator on `/products` and through `/api/products` (`POST /api/products` and `PUT /api/products/:id`) to set a product image either by uploading an image file or by entering an `http` or `https` image URL, or to leave the product without an image (`imageUrl` as `""`). Both Express and Cloudflare Worker runtimes MUST validate and persist the resulting product image identically.

#### Scenario: Set product image by uploading a valid file
- **WHEN** an administrator selects a valid image file in the product form on `/products` and saves the product
- **THEN** the system accepts the uploaded image, stores the product image reference on the product record, returns it in `{ item }`, and renders the uploaded image in the `/products` table and cart

#### Scenario: Set product image by entering an http or https URL
- **WHEN** an administrator enters a valid `http` or `https` URL in the product form on `/products` and saves the product
- **THEN** the system stores the trimmed URL on the product record, returns it in `{ item }`, and renders the image from that URL

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

## MODIFIED Requirements

### Requirement: List products with resolved category names
The system SHALL return all products ordered by `createdAt` descending from `GET /api/products` as `{ items }`, where each item includes `id`, `name`, `sku`, `price`, `categoryId`, resolved `categoryName`, `description`, `imageUrl`, `quantity`, `published`, `createdAt`, and optional `updatedAt`. `imageUrl` is an empty string when the product has no image. `quantity` is a whole number and is `0` when an older document has no quantity.

#### Scenario: Fetch products from catalog
- **WHEN** a client sends `GET /api/products`
- **THEN** the system responds with HTTP 200 and `{ items }` ordered by `createdAt` descending with each product's `categoryName` populated from its category and its publish state included

#### Scenario: Seed starter products on first request
- **WHEN** a client sends `GET /api/products` and both `categories` and `products` collections are empty
- **THEN** the system inserts the starter categories and starter products (`Wireless Mouse`, `Field Guide`, `Desk Lamp`) before returning the list

### Requirement: Create product with validated fields
The system SHALL create a product via `POST /api/products` requiring a non-empty trimmed `name`, an existing `categoryId`, a finite non-negative numeric `price` rounded to two decimal places, and a whole-number `quantity` that is zero or greater, along with optional trimmed `sku`, `description`, product image (via uploaded file or `http`/`https` `imageUrl`), and `published` state.

#### Scenario: Create valid product
- **WHEN** a client sends `POST /api/products` with a valid `name`, existing `categoryId`, non-negative `price`, whole-number `quantity`, and optional `sku`, `description`, image (file upload or `imageUrl`), and `published` state
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
The system SHALL update an existing product's `name`, `sku`, `price`, `categoryId`, `description`, `imageUrl` (from an uploaded image file or URL), `quantity`, `published` state, and `updatedAt` timestamp via `PUT /api/products/:id` using the same field validations as product creation.

#### Scenario: Update product fields
- **WHEN** a client sends `PUT /api/products/:id` for an existing product with valid fields (including updated image or `published` state)
- **THEN** the system updates the product document, sets `updatedAt`, and responds with HTTP 200 and `{ item }`

#### Scenario: Update non-existent product
- **WHEN** a client sends `PUT /api/products/:id` for an `id` that does not exist
- **THEN** the system responds with HTTP 404 and `{ "error": "Product not found" }`

### Requirement: Products administrative UI
The system SHALL serve the `/products` administrative page in both Express and Cloudflare Worker runtimes, displaying all products (both published and unpublished) in a product table with inline add, edit, publish/unpublish, image file upload or URL input, and confirmed delete workflows. The page also keeps an in-memory cart. `Add to Cart` adds one unit of that product and stops when the cart quantity reaches the product's stored `quantity`. The cart is not written to the API and is cleared on reload.

#### Scenario: View and manage products on admin page
- **WHEN** an administrator navigates to `/products`
- **THEN** the page loads `/api/products` and `/api/categories` in parallel, renders the product table with prices formatted to two decimal places, shows each product's image, quantity, and publish status, and provides controls to add, edit (with image file upload or image URL entry), publish/unpublish, add to cart, and delete products
