# Proposal: add-login-function

## Why

Currently, every administrative page (`/products`, `/brands`, `/categories`) and every catalog mutation API endpoint (`POST`, `PUT`, `DELETE` under `/api/products`, `/api/brands`, and `/api/categories`) is publicly accessible without authentication (tracked in Project Memory as KI-003). Adding a MongoDB `userinfo` collection for user accounts, a Login page at `/login` supporting both `username` + `password` and `email` + `password`, session-protected catalog administration with redirect to `/products` after login and `/dashboard` after logout, and public `/dashboard` browsing with a `Login` button secures catalog management while keeping the storefront open to visitors.

## What Changes

- **MongoDB `userinfo` Collection**:
  - Add a `userinfo` collection in MongoDB (`src/store.js`) storing user account records (`id`, case-insensitive unique `username`, case-insensitive unique `email`, non-plaintext password hash, `createdAt`, optional `updatedAt`), never exposing password hashes in API responses or secrets in source control.
- **Login Page at `/login` (`username + password` and `email + password`)**:
  - Serve `/login` in both the local Express server (`src/app.js` `pagePaths`) and the Cloudflare Worker (`src/worker.js` + `ASSETS`), and register `/login` in `web/src/App.jsx` with `document.title` set to `Login`.
  - Render an accessible login form on `/login` accepting either `username` + `password` or `email` + `password`, displaying authentication or validation errors in `.message.error`, and redirecting to `/products` upon successful login (or if already logged in).
- **Administrator Session Enforcement & Logout (Express/Worker Parity)**:
  - **BREAKING**: Require an active authenticated session for `POST`, `PUT`, and `DELETE` operations on `/api/products`, `/api/brands`, and `/api/categories` across both Express (`src/app.js`, `src/routes/*.js`) and Cloudflare Worker (`src/worker.js`), returning HTTP 401 `{ "error": "<message>" }` when unauthenticated.
  - Gate `/products`, `/brands`, and `/categories` UI views so unauthenticated visitors are redirected to `/login`, while keeping top navigation `Dashboard | Products | Brands | Categories` intact.
  - Provide a `Logout` action and logout API endpoint in both runtimes that clears the active session and opens `/dashboard`.
- **Dashboard `Login` Button & Public Storefront Access**:
  - Add an accessible `Login` button on `/dashboard` when logged out (navigating to `/login`) and `Logout` when logged in (ending the session and opening `/dashboard`).
  - Keep `GET /` (redirecting to `/dashboard`), `/dashboard`, and the catalog read endpoints (`GET /api/products`, `GET /api/brands`, `GET /api/categories`) publicly accessible without login, preserving client-side `publishedCatalog` filtering on `/dashboard`.

### Acceptance Criteria

1. User records are stored in the MongoDB `userinfo` collection with unique case-insensitive `username` and `email` and hashed passwords; no API response returns password fields and no secrets appear in source files or `wrangler.toml`.
2. Requesting `/login` on Express or Cloudflare Worker returns HTTP 200 HTML (`document.title === "Login"`) and allows signing in with either `username` + `password` or `email` + `password`.
3. Valid login establishes an authenticated session and redirects the browser to `/products`; invalid credentials return HTTP 401 `{ "error": "<message>" }` displayed on `/login`; blank fields return HTTP 400.
4. Activating `Logout` clears the authenticated session across Express and Cloudflare Worker and opens `/dashboard`.
5. Navigating to `/products`, `/brands`, or `/categories` while logged out redirects to `/login`; sending unauthenticated `POST`, `PUT`, or `DELETE` requests to `/api/products`, `/api/brands`, or `/api/categories` returns HTTP 401 `{ "error": "<message>" }` without mutating MongoDB.
6. Users who are not logged in can open `/` and `/dashboard`, load `GET /api/products`, `GET /api/brands`, and `GET /api/categories` with HTTP 200, filter/sort products, and click the `Login` button on `/dashboard` to open `/login`.

## Capabilities

### New Capabilities
- `admin-authentication`: MongoDB `userinfo` credential storage, `/login` page supporting `username` + `password` and `email` + `password`, post-login redirect to `/products`, logout redirect to `/dashboard`, and Express/Cloudflare Worker session enforcement protecting admin pages and write APIs.

### Modified Capabilities
- `product-dashboard`: Add `Login` (when logged out) and `Logout` (when logged in) controls on `/dashboard`, and explicitly guarantee unauthenticated public viewing and filtering of `/dashboard` (and `GET /` landing redirect).
- `product-management`: Require an authenticated administrator session to view `/products` and to call `POST /api/products`, `PUT /api/products/:id`, and `DELETE /api/products/:id`, while keeping `GET /api/products` publicly readable for `/dashboard`.
- `brand-management`: Require an authenticated administrator session to view `/brands` and to call `POST /api/brands`, `PUT /api/brands/:id`, and `DELETE /api/brands/:id`, while keeping `GET /api/brands` publicly readable for `/dashboard`.
- `category-management`: Require an authenticated administrator session to view `/categories` and to call `POST /api/categories`, `PUT /api/categories/:id`, and `DELETE /api/categories/:id`, while keeping `GET /api/categories` publicly readable for `/dashboard`.

## Impact

- **Backend & Shared Store**: `src/store.js` (`userinfo` collection, unique `username`/`email` indexes, credential verification), `src/app.js` (`/login` in `pagePaths`, auth routes, write-route guards), `src/routes/products.js`, `src/routes/brands.js`, `src/routes/categories.js`, `src/worker.js` (matching auth endpoints and HTTP 401 write guards), and `src/env.js` (runtime signing secret / bootstrap config).
- **Frontend UI & Routing**: `web/src/App.jsx` (`/login` route, `PAGE_TITLES`, auth session state, protected `/products`, `/brands`, `/categories` routes, `Logout` control), `web/src/components/Dashboard.jsx` (`Login` / `Logout` control on Dashboard), `web/src/api.js`, and a new Login component under `web/src/components/`.
- **Configuration & Documentation (later stages)**: `.env.example` and `.dev.vars.example` placeholders for any runtime session signing secret or initial bootstrap variables, plus an ADR in `.ai/memory/decisions/` during memory update. Out-of-scope change `openspec/changes/update-product-manage/` is untouched.
- **Tests & Specs**: `node:test` suites (`npm test`) and OpenSpec delta specs under `openspec/changes/add-login-function/specs/`.

## Assumptions

- User accounts are stored in the MongoDB `userinfo` collection and support login with either `username` + `password` or `email` + `password` (case-insensitive lookup on `username` and `email`).
- Successful login redirects to `/products` (and visiting `/login` while already authenticated also redirects to `/products`); logging out clears the session and opens `/dashboard`.
- The top navigation menu keeps `Dashboard | Products | Brands | Categories` visible; clicking `Products`, `Brands`, or `Categories` while unauthenticated redirects to `/login`.
- `GET /api/products`, `GET /api/brands`, and `GET /api/categories` remain publicly readable without authentication so `/dashboard` continues filtering published products client-side via `publishedCatalog`.
- Every route, status code, and `{ "error": "<message>" }` JSON contract behaves identically in local Express (`src/app.js`) and Cloudflare Worker (`src/worker.js`), with no secrets committed to source or `wrangler.toml`.

## Open questions

1. **`userinfo` management scope and initial admin bootstrap**: Besides storing user accounts in the MongoDB `userinfo` collection for `/login`, should this change also add an authenticated admin UI table/page (for example `/users` or `/userinfo`) and `/api/userinfo` CRUD endpoints to create/edit/delete users, and how should the first admin account be seeded/bootstrapped when `userinfo` is empty without committing plaintext credentials?
2. **Session mechanism and TTL across Express and Cloudflare Worker**: Should sessions use a stateless HMAC-signed `HttpOnly` cookie or bearer token (signed with a runtime secret in `.env` / `.dev.vars` / Worker secret), and what session expiration/TTL (e.g., browser session vs. 8h / 24h) should apply?
3. **Exact `Login` / `Logout` control placement**: Where on `/dashboard` (and across `/products`, `/brands`, `/categories`) should the `Login` / `Logout` button sit visually (for example, right-aligned in the top navigation bar vs. inside the page/panel header)?
