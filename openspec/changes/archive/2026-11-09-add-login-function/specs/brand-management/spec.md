# brand-management Specification Delta

## ADDED Requirements

### Requirement: Require administrator authentication to manage brands
The system SHALL require an authenticated administrator session to access the `/brands` management view and to execute `POST /api/brands`, `PUT /api/brands/:id`, and `DELETE /api/brands/:id` in Express and Cloudflare Worker runtimes, while keeping `GET /api/brands` publicly accessible.

#### Scenario: Unauthenticated visitor opening /brands is redirected to /login
- **WHEN** a user who is not logged in navigates to `/brands`
- **THEN** the application redirects to `/login` without rendering the brand management table, add/edit form, or row actions

#### Scenario: Unauthenticated brand write API call returns HTTP 401
- **WHEN** an unauthenticated client sends `POST /api/brands`, `PUT /api/brands/:id`, or `DELETE /api/brands/:id` to Express or the Cloudflare Worker
- **THEN** the server responds with HTTP 401 and `{ "error": "<message>" }` without creating, updating, or deleting any brand document

#### Scenario: Unauthenticated GET /api/brands remains allowed
- **WHEN** an unauthenticated client sends `GET /api/brands`
- **THEN** Express and the Cloudflare Worker respond with HTTP 200 and `{ items }` so `/dashboard` can render brand filters

## MODIFIED Requirements

### Requirement: Create brand with unique case-insensitive name
The system SHALL create a new brand for an authenticated administrator via `POST /api/brands` with a required trimmed `name` and optional trimmed `description`, enforcing case-insensitive name uniqueness across all brands in both Express and Cloudflare Worker runtimes.

#### Scenario: Create valid brand
- **WHEN** an authenticated administrator client sends `POST /api/brands` with a unique non-empty `name` and optional `description`
- **THEN** the system responds with HTTP 201 and `{ item }` containing a generated UUID `id`, `createdAt` timestamp, and `productCount: 0`

#### Scenario: Reject missing brand name
- **WHEN** an authenticated administrator client sends `POST /api/brands` with an empty or whitespace-only `name`
- **THEN** the system responds with HTTP 400 and `{ "error": "Name is required" }`

#### Scenario: Reject duplicate brand name ignoring case
- **WHEN** an authenticated administrator client sends `POST /api/brands` with a `name` that matches an existing brand case-insensitively
- **THEN** the system responds with HTTP 409 and `{ "error": "A brand with that name already exists" }`

### Requirement: Update existing brand
The system SHALL update a brand's `name`, `description`, and `updatedAt` timestamp for an authenticated administrator via `PUT /api/brands/:id` while enforcing non-empty name validation and case-insensitive uniqueness against other brands in both Express and Cloudflare Worker runtimes.

#### Scenario: Update brand name and description
- **WHEN** an authenticated administrator client sends `PUT /api/brands/:id` for an existing brand with a valid, non-conflicting `name`
- **THEN** the system updates the brand record, sets `updatedAt`, and responds with HTTP 200 and `{ item }` including the current `productCount`

#### Scenario: Update non-existent brand
- **WHEN** an authenticated administrator client sends `PUT /api/brands/:id` for an `id` that does not exist
- **THEN** the system responds with HTTP 404 and `{ "error": "Brand not found" }`

#### Scenario: Reject rename to an existing brand name
- **WHEN** an authenticated administrator client sends `PUT /api/brands/:id` with a `name` that matches another existing brand case-insensitively
- **THEN** the system responds with HTTP 409 and `{ "error": "A brand with that name already exists" }`

### Requirement: Delete empty brand only
The system SHALL delete a brand for an authenticated administrator via `DELETE /api/brands/:id` only when the brand exists and zero products reference its `id` (`brandId`).

#### Scenario: Delete brand with zero products
- **WHEN** an authenticated administrator client sends `DELETE /api/brands/:id` for an existing brand that has no assigned products
- **THEN** the system deletes the brand and responds with HTTP 200 and `{ "deleted": true }`

#### Scenario: Block deletion of brand with assigned products
- **WHEN** an authenticated administrator client sends `DELETE /api/brands/:id` for a brand that is referenced by one or more products
- **THEN** the system retains the brand and responds with HTTP 409 and `{ "error": "Move or delete products in this brand first" }`

#### Scenario: Delete non-existent brand
- **WHEN** an authenticated administrator client sends `DELETE /api/brands/:id` for an `id` that does not exist
- **THEN** the system responds with HTTP 404 and `{ "error": "Brand not found" }`

### Requirement: Brands administrative UI and navigation order
The system SHALL serve the `/brands` administrative page to authenticated admins in both Express and Cloudflare Worker runtimes at a page width of up to 1600px, set `document.title` and `<h1>` to `Brands`, render the navigation menu bar in the exact order `Dashboard | Products | Brands | Categories`, and display a brand table (`No`, `Name`, `Description`, `Products`, `Action`) with inline add, edit, and confirmed delete workflows.

#### Scenario: View and manage brands on admin page
- **WHEN** an authenticated administrator navigates to `/brands`
- **THEN** the page displays the navigation menu in order `Dashboard | Products | Brands | Categories` with `Brands` active, loads `GET /api/brands`, renders each brand row with its product count, and provides `Add` plus `Edit` and `Delete` icon actions

#### Scenario: Delete a brand after confirmation
- **WHEN** an authenticated administrator clicks the `Delete` action on a brand row on `/brands`
- **THEN** the page asks for confirmation and, only after confirmation, sends `DELETE /api/brands/:id` and removes the row or displays the API conflict error in `.message.error`
