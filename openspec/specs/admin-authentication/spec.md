# admin-authentication Specification

## Purpose
Provides MongoDB `userinfo` account storage, the `/login` page supporting `username` + `password` and `email` + `password`, post-login redirect to `/products`, logout to `/dashboard`, and Express/Cloudflare Worker session guards for catalog administration.

## Requirements

### Requirement: Store user accounts in MongoDB userinfo collection
The system SHALL store administrator user accounts in a MongoDB `userinfo` collection containing `id`, case-insensitive unique `username`, case-insensitive unique `email`, a non-plaintext password hash, and timestamps, and MUST NEVER expose password fields in API responses.

#### Scenario: Lookup userinfo account by username or email ignoring case
- **WHEN** the authentication store looks up a user record in `userinfo` by `username` or `email`
- **THEN** matching is performed case-insensitively (`{ locale: "en", strength: 2 }`) across both Express and Cloudflare Worker runtimes

#### Scenario: Password hashes are omitted from API payloads
- **WHEN** any authentication or session API endpoint returns user or session JSON
- **THEN** the response excludes raw passwords and password hash fields

### Requirement: Serve Login page at /login across runtimes
The system SHALL serve the Login page at `/login` in both Express and Cloudflare Worker runtimes, set `document.title` to `Login`, render a login form accepting `username` or `email` with `password`, and redirect already-authenticated administrators from `/login` to `/products`.

#### Scenario: Request /login directly on Express or Cloudflare Worker
- **WHEN** an unauthenticated user sends `GET /login` to the Express server or the Cloudflare Worker
- **THEN** the runtime responds with HTTP 200 HTML, the React application sets `document.title` to `Login`, and the Login credential form is rendered

#### Scenario: Navigate client-side to /login without redirecting to /dashboard
- **WHEN** an unauthenticated user navigates to `/login` inside the single-page application
- **THEN** the router renders the Login page at `/login` instead of matching the unknown-route fallback to `/dashboard`

#### Scenario: Already-authenticated administrator visiting /login redirects to /products
- **WHEN** an administrator with an active authenticated session navigates to `/login`
- **THEN** the application redirects the browser to `/products`

### Requirement: Authenticate with username or email and password
The system SHALL authenticate `username` + `password` or `email` + `password` against the MongoDB `userinfo` collection identically in Express and Cloudflare Worker runtimes, establishing an admin session and redirecting the browser to `/products` upon valid login.

#### Scenario: Valid login with username and password redirects to /products
- **WHEN** a user submits a valid `username` and matching `password` on `/login`
- **THEN** the authentication API in both Express and Cloudflare Worker establishes an authenticated session, responds with HTTP 200 JSON, and redirects the browser to `/products`

#### Scenario: Valid login with email and password redirects to /products
- **WHEN** a user submits a valid `email` and matching `password` on `/login`
- **THEN** the authentication API in both Express and Cloudflare Worker establishes an authenticated session, responds with HTTP 200 JSON, and redirects the browser to `/products`

#### Scenario: Invalid credentials return HTTP 401
- **WHEN** a user submits an unknown `username`/`email` or an incorrect `password` on `/login` or to the authentication API
- **THEN** Express and Cloudflare Worker respond with HTTP 401 and `{ "error": "<message>" }`, no authenticated session is created, and `/login` displays the error message in `.message.error`

#### Scenario: Missing or blank credential fields return HTTP 400
- **WHEN** a client submits a login request without a `username`/`email` identifier or without a non-empty `password`
- **THEN** the server rejects the request with HTTP 400 and `{ "error": "<message>" }` without creating a session

#### Scenario: Malformed JSON login request body is rejected
- **WHEN** a client sends a non-JSON payload to the authentication API endpoint
- **THEN** the server rejects the request with HTTP 400 and a JSON `{ "error": "<message>" }` response without creating a session

#### Scenario: Missing server authentication configuration fails closed
- **WHEN** a login or session check arrives while required runtime configuration (`MONGODB_URI` or session signing secret) is missing
- **THEN** the server denies authentication without granting admin access and without leaking secret values in the response

### Requirement: Enforce administrator session on management views and write APIs
The system SHALL verify an active administrator session before rendering `/products`, `/brands`, or `/categories` management views and before executing `POST`, `PUT`, or `DELETE` requests on `/api/products`, `/api/brands`, and `/api/categories` in both Express and Cloudflare Worker runtimes.

#### Scenario: Unauthenticated user navigating to an admin page is redirected to /login
- **WHEN** an unauthenticated user navigates directly or clicks `Products`, `Brands`, or `Categories` in the navigation bar
- **THEN** the application redirects the browser to `/login` without rendering catalog add, edit, or delete management controls

#### Scenario: Authenticated administrator retains access across admin pages
- **WHEN** a logged-in administrator with an active session navigates between `/products`, `/brands`, `/categories`, and `/dashboard` or reloads an admin page
- **THEN** the application recognizes the active session and renders the requested management page without prompting to log in again

#### Scenario: Unauthenticated write API request is rejected with HTTP 401
- **WHEN** an unauthenticated caller sends `POST`, `PUT`, or `DELETE` to `/api/products`, `/api/brands`, or `/api/categories` (or `/:id`) on Express or Cloudflare Worker
- **THEN** the runtime responds with HTTP 401 and `{ "error": "<message>" }` before mutating any MongoDB collection

#### Scenario: Expired or tampered session credential is treated as unauthenticated
- **WHEN** a caller presents an expired, malformed, or invalidly signed session credential on an admin route or catalog write API request
- **THEN** the system rejects write API calls with HTTP 401 `{ "error": "<message>" }` and redirects admin page navigation to `/login`

### Requirement: Administrator logout opens Dashboard page
The system SHALL provide a `Logout` control for authenticated administrators and a logout endpoint across Express and Cloudflare Worker runtimes that clears the active session and navigates the browser to `/dashboard`.

#### Scenario: Administrator logs out and opens Dashboard page
- **WHEN** a logged-in administrator activates the `Logout` control from an admin page or `/dashboard`
- **THEN** the logout API clears the active session in Express or Cloudflare Worker, subsequent admin routes and write APIs treat the caller as unauthenticated, and the browser opens `/dashboard`
