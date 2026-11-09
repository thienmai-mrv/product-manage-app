# product-dashboard Specification Delta

## ADDED Requirements

### Requirement: Login and Logout controls on the Dashboard page
The system SHALL render an accessible `Login` button on `/dashboard` when unauthenticated that navigates to `/login`, and render a `Logout` control when authenticated that signs the administrator out and keeps `/dashboard` open.

#### Scenario: Unauthenticated visitor sees Login button on Dashboard
- **WHEN** an unauthenticated user loads `/dashboard`
- **THEN** the Dashboard page renders a visible `Login` control alongside the storefront view without blocking catalog rendering

#### Scenario: Activating Login button on Dashboard navigates to /login
- **WHEN** an unauthenticated user clicks or activates the `Login` control on `/dashboard`
- **THEN** the browser navigates to `/login` and renders the administrator Login page

#### Scenario: Authenticated administrator logs out from Dashboard and stays on Dashboard
- **WHEN** a logged-in administrator views `/dashboard` and activates the `Logout` control
- **THEN** the session is cleared, `/dashboard` remains open for public browsing, and the `Login` button is displayed again

### Requirement: Unauthenticated public access to Dashboard
The system SHALL allow users who are not logged in to view `/dashboard`, fetch catalog products, brands, and categories, and interact with all client-side sorting, filtering, removable chips, and session wishlist controls without authenticating.

#### Scenario: Unauthenticated visitor browses and filters Dashboard catalog
- **WHEN** a user who is not logged in navigates to `/dashboard`
- **THEN** the page loads `GET /api/products`, `GET /api/brands`, and `GET /api/categories` with HTTP 200 and lets the user sort, filter by availability, price, brand, and category, remove chips, and toggle wishlist hearts without redirecting to `/login`

#### Scenario: Root redirect lands unauthenticated visitor on Dashboard
- **WHEN** an unauthenticated user requests `GET /` or opens `/` in the browser
- **THEN** the user is redirected to `/dashboard` and views the storefront catalog without being prompted to log in

## MODIFIED Requirements

### Requirement: Dashboard route and landing page redirect
The system SHALL publicly serve the storefront Dashboard view at `/dashboard` without requiring login in both Express and Cloudflare Worker runtimes, redirect `GET /` with HTTP 302 to `/dashboard`, route unknown client paths to `/dashboard`, set `document.title` to `Dashboard`, omit the administrative `<h1>` page header, and render the navigation menu bar in the exact order `Dashboard | Products | Brands | Categories`.

#### Scenario: Root URL redirects to dashboard
- **WHEN** a client requests `GET /` on Express or the Cloudflare Worker
- **THEN** the server responds with HTTP 302 and `Location: /dashboard`

#### Scenario: Dashboard page renders two-column layout
- **WHEN** an authenticated or unauthenticated user navigates to `/dashboard`
- **THEN** the application renders the navigation menu bar in order `Dashboard | Products | Brands | Categories`, fetches `GET /api/products`, `GET /api/brands`, and `GET /api/categories` once on mount in parallel, sets `document.title` to `Dashboard`, omits the administrative `<h1>` header, and renders the Left Filter Panel alongside the Right Product Panel
