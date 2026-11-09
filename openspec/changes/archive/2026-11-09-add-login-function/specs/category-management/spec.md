# category-management Specification Delta

## ADDED Requirements

### Requirement: Require administrator authentication to manage categories
The system SHALL require an authenticated administrator session to access the `/categories` management view and to execute `POST /api/categories`, `PUT /api/categories/:id`, and `DELETE /api/categories/:id` in Express and Cloudflare Worker runtimes, while keeping `GET /api/categories` publicly accessible.

#### Scenario: Unauthenticated visitor opening /categories is redirected to /login
- **WHEN** a user who is not logged in navigates to `/categories`
- **THEN** the application redirects to `/login` without rendering the category management table, add/edit form, or row actions

#### Scenario: Unauthenticated category write API call returns HTTP 401
- **WHEN** an unauthenticated client sends `POST /api/categories`, `PUT /api/categories/:id`, or `DELETE /api/categories/:id` to Express or the Cloudflare Worker
- **THEN** the server responds with HTTP 401 and `{ "error": "<message>" }` without creating, updating, or deleting any category document

#### Scenario: Unauthenticated GET /api/categories remains allowed
- **WHEN** an unauthenticated client sends `GET /api/categories`
- **THEN** Express and the Cloudflare Worker respond with HTTP 200 and `{ items }` so `/dashboard` can render category filters

## MODIFIED Requirements

### Requirement: Create category with unique case-insensitive name
The system SHALL create a new category for an authenticated administrator via `POST /api/categories` with a required trimmed `name` and optional trimmed `description`, enforcing case-insensitive name uniqueness across all categories.

#### Scenario: Create valid category
- **WHEN** an authenticated administrator client sends `POST /api/categories` with a unique non-empty `name` and optional `description`
- **THEN** the system responds with HTTP 201 and `{ item }` containing a generated UUID `id`, `createdAt` timestamp, and `productCount: 0`

#### Scenario: Reject missing category name
- **WHEN** an authenticated administrator client sends `POST /api/categories` with an empty or whitespace-only `name`
- **THEN** the system responds with HTTP 400 and `{ "error": "Name is required" }`

#### Scenario: Reject duplicate category name ignoring case
- **WHEN** an authenticated administrator client sends `POST /api/categories` with a `name` that matches an existing category case-insensitively
- **THEN** the system responds with HTTP 409 and `{ "error": "A category with that name already exists" }`

### Requirement: Update existing category
The system SHALL update a category's `name`, `description`, and `updatedAt` timestamp for an authenticated administrator via `PUT /api/categories/:id` while enforcing non-empty name validation and case-insensitive uniqueness against other categories.

#### Scenario: Update category name and description
- **WHEN** an authenticated administrator client sends `PUT /api/categories/:id` for an existing category with a valid, non-conflicting `name`
- **THEN** the system updates the category record, sets `updatedAt`, and responds with HTTP 200 and `{ item }` including the current `productCount`

#### Scenario: Update non-existent category
- **WHEN** an authenticated administrator client sends `PUT /api/categories/:id` for an `id` that does not exist
- **THEN** the system responds with HTTP 404 and `{ "error": "Category not found" }`

#### Scenario: Reject rename to an existing category name
- **WHEN** an authenticated administrator client sends `PUT /api/categories/:id` with a `name` that matches another existing category case-insensitively
- **THEN** the system responds with HTTP 409 and `{ "error": "A category with that name already exists" }`

### Requirement: Delete empty category only
The system SHALL delete a category for an authenticated administrator via `DELETE /api/categories/:id` only when the category exists and zero products reference its `id`.

#### Scenario: Delete category with zero products
- **WHEN** an authenticated administrator client sends `DELETE /api/categories/:id` for an existing category that has no assigned products
- **THEN** the system deletes the category and responds with HTTP 200 and `{ "deleted": true }`

#### Scenario: Block deletion of category with assigned products
- **WHEN** an authenticated administrator client sends `DELETE /api/categories/:id` for a category that is referenced by one or more products
- **THEN** the system retains the category and responds with HTTP 409 and `{ "error": "Move or delete products in this category first" }`

#### Scenario: Delete non-existent category
- **WHEN** an authenticated administrator client sends `DELETE /api/categories/:id` for an `id` that does not exist
- **THEN** the system responds with HTTP 404 and `{ "error": "Category not found" }`

### Requirement: Categories administrative UI
The system SHALL serve the `/categories` administrative page to authenticated admins in both Express and Cloudflare Worker runtimes, displaying a category table (`No`, `Name`, `Description`, `Products`, `Action`) with inline add, edit, and confirmed delete workflows.

#### Scenario: View and manage categories on admin page
- **WHEN** an authenticated administrator navigates to `/categories`
- **THEN** the page loads `GET /api/categories`, renders each category row with its product count, and provides `Add`, `Edit`, and `Delete` actions
