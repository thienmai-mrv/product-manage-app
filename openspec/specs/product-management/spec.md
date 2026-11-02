# product-management Specification

## Purpose

Provides product catalog storage, validation, REST API endpoints (`/api/products`), starter catalog seeding, and the `/products` administrative management interface for creating, updating, and deleting products.

## Requirements

### Requirement: List products with resolved category names
The system SHALL return all products ordered by `createdAt` descending from `GET /api/products` as `{ items }`, where each item includes `id`, `name`, `sku`, `price`, `categoryId`, resolved `categoryName`, `description`, `imageUrl`, `quantity`, `createdAt`, and optional `updatedAt`. `imageUrl` is an empty string when the product has no image. `quantity` is a whole number and is `0` when an older document has no quantity.

#### Scenario: Fetch products from catalog
- **WHEN** a client sends `GET /api/products`
- **THEN** the system responds with HTTP 200 and `{ items }` ordered by `createdAt` descending with each product's `categoryName` populated from its category

#### Scenario: Seed starter products on first request
- **WHEN** a client sends `GET /api/products` and both `categories` and `products` collections are empty
- **THEN** the system inserts the starter categories and starter products (`Wireless Mouse`, `Field Guide`, `Desk Lamp`) before returning the list

### Requirement: Create product with validated fields
The system SHALL create a product via `POST /api/products` requiring a non-empty trimmed `name`, an existing `categoryId`, a finite non-negative numeric `price` rounded to two decimal places, and a whole-number `quantity` that is zero or greater, along with optional trimmed `sku`, `description`, and `imageUrl`. `imageUrl` must be empty or an `http` or `https` URL.

#### Scenario: Create valid product
- **WHEN** a client sends `POST /api/products` with a valid `name`, existing `categoryId`, non-negative `price`, whole-number `quantity`, and optional `sku`, `description`, and `imageUrl`
- **THEN** the system stores the product with a generated UUID `id` and `createdAt` timestamp and responds with HTTP 201 and `{ item }`

#### Scenario: Reject product with missing name or invalid category
- **WHEN** a client sends `POST /api/products` with a blank `name` or a `categoryId` that does not match an existing category
- **THEN** the system responds with HTTP 400 and an error message (`"Name is required"`, `"Category is required"`, or `"Category not found"`)

#### Scenario: Reject product with negative or non-numeric price
- **WHEN** a client sends `POST /api/products` with a negative or non-finite `price`
- **THEN** the system responds with HTTP 400 and `{ "error": "Price must be a number that is zero or greater" }`

#### Scenario: Reject product with an invalid image or quantity
- **WHEN** a client sends `POST /api/products` with an image that is not an `http` or `https` URL, or a quantity that is negative or not a whole number
- **THEN** the system responds with HTTP 400 and `{ "error": "Image must be an http or https URL" }` or `{ "error": "Quantity must be a whole number that is zero or greater" }`

### Requirement: Update existing product
The system SHALL update an existing product's `name`, `sku`, `price`, `categoryId`, `description`, `imageUrl`, `quantity`, and `updatedAt` timestamp via `PUT /api/products/:id` using the same field validations as product creation.

#### Scenario: Update product fields
- **WHEN** a client sends `PUT /api/products/:id` for an existing product with valid fields
- **THEN** the system updates the product document, sets `updatedAt`, and responds with HTTP 200 and `{ item }`

#### Scenario: Update non-existent product
- **WHEN** a client sends `PUT /api/products/:id` for an `id` that does not exist
- **THEN** the system responds with HTTP 404 and `{ "error": "Product not found" }`

### Requirement: Delete existing product
The system SHALL delete a product by `id` via `DELETE /api/products/:id` and return a confirmation payload.

#### Scenario: Delete existing product
- **WHEN** a client sends `DELETE /api/products/:id` for an existing product
- **THEN** the system removes the product document from MongoDB and responds with HTTP 200 and `{ "deleted": true }`

#### Scenario: Delete non-existent product
- **WHEN** a client sends `DELETE /api/products/:id` for an `id` that does not exist
- **THEN** the system responds with HTTP 404 and `{ "error": "Product not found" }`

### Requirement: Products administrative UI
The system SHALL serve the `/products` administrative page in both Express and Cloudflare Worker runtimes, displaying a product table (`No`, `Name`, `SKU`, `Category`, `Price`, `Image`, `Quantity`, `Description`, `Action`) with inline add, edit, and confirmed delete workflows. The page also keeps an in-memory cart. `Add to Cart` adds one unit of that product and stops when the cart quantity reaches the product's stored `quantity`. The cart is not written to the API and is cleared on reload.

#### Scenario: View and manage products on admin page
- **WHEN** an administrator navigates to `/products`
- **THEN** the page loads `/api/products` and `/api/categories` in parallel, renders the product table with prices formatted to two decimal places, shows the image and quantity, and provides `Add`, `Add to Cart`, `Edit`, and `Delete` actions
