# brand-management Specification

## Purpose
Provides brand catalog storage, case-insensitive unique name validation, REST API endpoints (`/api/brands`), Dien May Xanh sample brand seeding, and the `/brands` administrative management interface for organizing products by brand.

## Requirements

### Requirement: List brands with product counts
The system SHALL return all brands ordered by `createdAt` descending from `GET /api/brands` as `{ items }` in both Express and Cloudflare Worker runtimes, where each item includes `id`, `name`, `description`, `createdAt`, optional `updatedAt`, and `productCount` representing the number of products assigned to that brand.

#### Scenario: Fetch brands from non-empty catalog
- **WHEN** a client sends `GET /api/brands` and brands exist in MongoDB
- **THEN** the system responds with HTTP 200 and `{ items }` ordered by `createdAt` descending with accurate `productCount` values

#### Scenario: Seed Dien May Xanh sample brands when brand catalog is empty
- **WHEN** a client sends `GET /api/brands` (or another catalog API request that triggers seeding) and sample brands have not been seeded yet
- **THEN** the system seeds sample brands sourced from `https://www.dienmayxanh.com` (such as `Samsung`, `Sony`, `LG`, `Panasonic`, `Toshiba`, `Apple`, `Electrolux`, `Daikin`, `Sharp`, `Casper`) before returning the brand list

### Requirement: Create brand with unique case-insensitive name
The system SHALL create a new brand via `POST /api/brands` with a required trimmed `name` and optional trimmed `description`, enforcing case-insensitive name uniqueness across all brands in both Express and Cloudflare Worker runtimes.

#### Scenario: Create valid brand
- **WHEN** a client sends `POST /api/brands` with a unique non-empty `name` and optional `description`
- **THEN** the system responds with HTTP 201 and `{ item }` containing a generated UUID `id`, `createdAt` timestamp, and `productCount: 0`

#### Scenario: Reject missing brand name
- **WHEN** a client sends `POST /api/brands` with an empty or whitespace-only `name`
- **THEN** the system responds with HTTP 400 and `{ "error": "Name is required" }`

#### Scenario: Reject duplicate brand name ignoring case
- **WHEN** a client sends `POST /api/brands` with a `name` that matches an existing brand case-insensitively
- **THEN** the system responds with HTTP 409 and `{ "error": "A brand with that name already exists" }`

### Requirement: Update existing brand
The system SHALL update a brand's `name`, `description`, and `updatedAt` timestamp via `PUT /api/brands/:id` while enforcing non-empty name validation and case-insensitive uniqueness against other brands in both Express and Cloudflare Worker runtimes.

#### Scenario: Update brand name and description
- **WHEN** a client sends `PUT /api/brands/:id` for an existing brand with a valid, non-conflicting `name`
- **THEN** the system updates the brand record, sets `updatedAt`, and responds with HTTP 200 and `{ item }` including the current `productCount`

#### Scenario: Update non-existent brand
- **WHEN** a client sends `PUT /api/brands/:id` for an `id` that does not exist
- **THEN** the system responds with HTTP 404 and `{ "error": "Brand not found" }`

#### Scenario: Reject rename to an existing brand name
- **WHEN** a client sends `PUT /api/brands/:id` with a `name` that matches another existing brand case-insensitively
- **THEN** the system responds with HTTP 409 and `{ "error": "A brand with that name already exists" }`

### Requirement: Delete empty brand only
The system SHALL delete a brand via `DELETE /api/brands/:id` only when the brand exists and zero products reference its `id` (`brandId`).

#### Scenario: Delete brand with zero products
- **WHEN** a client sends `DELETE /api/brands/:id` for an existing brand that has no assigned products
- **THEN** the system deletes the brand and responds with HTTP 200 and `{ "deleted": true }`

#### Scenario: Block deletion of brand with assigned products
- **WHEN** a client sends `DELETE /api/brands/:id` for a brand that is referenced by one or more products
- **THEN** the system retains the brand and responds with HTTP 409 and `{ "error": "Move or delete products in this brand first" }`

#### Scenario: Delete non-existent brand
- **WHEN** a client sends `DELETE /api/brands/:id` for an `id` that does not exist
- **THEN** the system responds with HTTP 404 and `{ "error": "Brand not found" }`

### Requirement: Brands administrative UI and navigation order
The system SHALL serve the `/brands` administrative page in both Express and Cloudflare Worker runtimes at a page width of up to 1600px, set `document.title` and `<h1>` to `Brands`, render the navigation menu bar in the exact order `Dashboard | Products | Brands | Categories`, and display a brand table (`No`, `Name`, `Description`, `Products`, `Action`) with inline add, edit, and confirmed delete workflows.

#### Scenario: View and manage brands on admin page
- **WHEN** an administrator navigates to `/brands`
- **THEN** the page displays the navigation menu in order `Dashboard | Products | Brands | Categories` with `Brands` active, loads `GET /api/brands`, renders each brand row with its product count, and provides `Add` plus `Edit` and `Delete` icon actions

#### Scenario: Delete a brand after confirmation
- **WHEN** an administrator clicks the `Delete` action on a brand row on `/brands`
- **THEN** the page asks for confirmation and, only after confirmation, sends `DELETE /api/brands/:id` and removes the row or displays the API conflict error in `.message.error`
