# product-management Specification Delta

## ADDED Requirements

### Requirement: Require administrator authentication to manage products
The system SHALL require an authenticated administrator session to access the `/products` management view and to execute `POST /api/products`, `PUT /api/products/:id`, and `DELETE /api/products/:id` in Express and Cloudflare Worker runtimes, while keeping `GET /api/products` publicly accessible.

#### Scenario: Unauthenticated visitor opening /products is redirected to /login
- **WHEN** a user who is not logged in navigates to `/products`
- **THEN** the application redirects to `/login` without rendering the product management table, add/edit form, or row controls

#### Scenario: Unauthenticated product write API call returns HTTP 401
- **WHEN** an unauthenticated client sends `POST /api/products`, `PUT /api/products/:id`, or `DELETE /api/products/:id` to Express or the Cloudflare Worker
- **THEN** the server responds with HTTP 401 and `{ "error": "<message>" }` without creating, updating, or deleting any product document

#### Scenario: Unauthenticated GET /api/products remains allowed
- **WHEN** an unauthenticated client sends `GET /api/products`
- **THEN** Express and the Cloudflare Worker respond with HTTP 200 and `{ items }` so `/dashboard` can render the catalog

## MODIFIED Requirements

### Requirement: Create product with validated fields
The system SHALL create a product for an authenticated administrator via `POST /api/products` requiring a non-empty trimmed `name`, a valid `brandId` matching an existing brand, an existing `categoryId`, a finite non-negative numeric `price` rounded to two decimal places, and a whole-number `quantity` that is zero or greater, along with optional trimmed `sku`, `description`, product image (uploaded file or `http`/`https` `imageUrl`), `published` state, and `inStock` status.

#### Scenario: Create valid product
- **WHEN** an authenticated administrator client sends `POST /api/products` with a valid `name`, existing `brandId`, existing `categoryId`, non-negative `price`, whole-number `quantity`, and optional `sku`, `description`, image, `published` state, and `inStock` status
- **THEN** the system stores the product with a generated UUID `id` and `createdAt` timestamp and responds with HTTP 201 and `{ item }` including `brandId` and resolved `brandName`

#### Scenario: Reject product with missing name or invalid category
- **WHEN** an authenticated administrator client sends `POST /api/products` with a blank `name`, a missing or non-existent `brandId`, or a missing or non-existent `categoryId`
- **THEN** the system responds with HTTP 400 and an error message (`"Name is required"`, `"Brand is required"`, `"Brand not found"`, `"Category is required"`, or `"Category not found"`)

#### Scenario: Reject product with negative or non-numeric price
- **WHEN** an authenticated administrator client sends `POST /api/products` with a negative or non-finite `price`
- **THEN** the system responds with HTTP 400 and `{ "error": "Price must be a number that is zero or greater" }`

#### Scenario: Reject product with an invalid image or quantity
- **WHEN** an authenticated administrator client sends `POST /api/products` with an invalid image URL or invalid uploaded image file, or a quantity that is negative or not a whole number
- **THEN** the system responds with HTTP 400 and a validation error message in `{ "error": "<message>" }`

### Requirement: Update existing product
The system SHALL update an existing product's `name`, `sku`, `price`, `brandId`, `categoryId`, `description`, `imageUrl` (from an uploaded image file or URL), `quantity`, `published` state, `inStock` status, and `updatedAt` timestamp for an authenticated administrator via `PUT /api/products/:id` using the same field validations as product creation.

#### Scenario: Update product fields
- **WHEN** an authenticated administrator client sends `PUT /api/products/:id` for an existing product with valid fields including an existing `brandId` and `categoryId`
- **THEN** the system updates the product document, sets `updatedAt`, and responds with HTTP 200 and `{ item }` with the updated `brandId` and resolved `brandName`

#### Scenario: Update non-existent product
- **WHEN** an authenticated administrator client sends `PUT /api/products/:id` for an `id` that does not exist
- **THEN** the system responds with HTTP 404 and `{ "error": "Product not found" }`

### Requirement: Delete existing product
The system SHALL delete a product by `id` for an authenticated administrator via `DELETE /api/products/:id` and return a confirmation payload.

#### Scenario: Delete existing product
- **WHEN** an authenticated administrator client sends `DELETE /api/products/:id` for an existing product
- **THEN** the system removes the product document from MongoDB and responds with HTTP 200 and `{ "deleted": true }`

#### Scenario: Delete non-existent product
- **WHEN** an authenticated administrator client sends `DELETE /api/products/:id` for an `id` that does not exist
- **THEN** the system responds with HTTP 404 and `{ "error": "Product not found" }`

### Requirement: Products administrative UI
The system SHALL serve the `/products` administrative page to authenticated admins in both Express and Cloudflare Worker runtimes, displaying the navigation menu in order `Dashboard | Products | Brands | Categories`, a product table including a `Brand` column (`No`, `Name`, `SKU`, `Brand`, `Category`, `Price`, `Image`, `Quantity`, `Description`, `Status`, `Stock`, `Action`), and inline add/edit forms where a product chooses a brand from `/api/brands` the same way it chooses a category.

#### Scenario: View and manage products on admin page
- **WHEN** an authenticated administrator navigates to `/products`
- **THEN** the page loads `/api/products`, `/api/brands`, and `/api/categories` in parallel, renders the product table with the `Brand` column showing each product's `brandName`, and provides `Add` plus row actions for stock, publish, edit, and delete

#### Scenario: Edit a product to change its brand
- **WHEN** an authenticated administrator clicks `Edit` on a product row on `/products`, selects a different brand from the `Brand` dropdown, and submits the form
- **THEN** the page sends `PUT /api/products/:id` with the selected `brandId` and updates the product row's `Brand` column with the resolved `brandName`
