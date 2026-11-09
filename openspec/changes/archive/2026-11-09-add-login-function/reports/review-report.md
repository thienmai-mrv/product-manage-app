# Review Report: add-login-function

**Reviewer agent:** antigravity
**Branch:** feature/add-login-function
**Base:** main

## Scope reviewed

- OpenSpec change artifacts under `openspec/changes/add-login-function/`: `proposal.md`, `design.md`, `tasks.md`, `approvals.md` (G1–G4 all `approved`), `specs/admin-authentication/spec.md`, `specs/product-dashboard/spec.md`, `specs/product-management/spec.md`, `specs/brand-management/spec.md`, `specs/category-management/spec.md`, `reports/development-report.md`, and `reports/test-report.md`.
- Complete diff `git diff main...HEAD` across shared authentication and store modules (`src/password.js`, `src/loginInput.js`, `src/session.js`, `src/httpErrors.js`, `src/requireAdmin.js`, `src/store.js`, `src/env.js`), Express and Cloudflare Worker HTTP/page adapters (`src/routes/auth.js`, `src/routes/products.js`, `src/routes/brands.js`, `src/routes/categories.js`, `src/app.js`, `src/worker.js`), React UI routing and components (`web/src/App.jsx`, `web/src/authPaths.js`, `web/src/components/AuthControl.jsx`, `web/src/components/Login.jsx`, `web/src/index.css`), runtime configuration and operator docs (`wrangler.toml`, `.env.example`, `.dev.vars.example`, `README.md`, `package.json`), and automated test suites (`src/auth.test.js`, `web/src/authView.test.js`, `src/qa-scenarios.test.js`, `src/brand-qa.test.js`, `src/login-qa.test.js`).

## Spec and design conformance

- **`admin-authentication`**:
  - `src/store.js` creates case-insensitive unique indexes `userinfo_username_ci` and `userinfo_email_ci` (`{ locale: "en", strength: 2 }`) on `userinfo` in `ensureIndexes` before setting `indexesReady = true`.
  - `src/password.js` hashes trimmed passwords using PBKDF2-SHA256 (`100000` iterations, 16-byte random salt, 32-byte digest, stored as `pbkdf2-sha256$100000$<base64url salt>$<base64url digest>`) and verifies digests in constant time via `timingSafeEqual`. `authenticate` runs a cached `invalid-user-timing-pad` PBKDF2 check on unknown accounts, shares a single HTTP 401 `"Invalid username, email, or password"` error, and returns `toPublicUser` (`{ id, username, email }`) with no password material.
  - `ensureAdminBootstrap` seeds a single hashed administrator from `AUTH_BOOTSTRAP_USERNAME`, `AUTH_BOOTSTRAP_EMAIL`, and `AUTH_BOOTSTRAP_PASSWORD` only when all three values are valid and `userinfo` is empty (swallowing Mongo `11000`), fails closed with HTTP 500 `"Admin bootstrap configuration is incomplete"` on `authenticate` when partial and `userinfo` is empty, and leaves public catalog reads unaffected.
  - `src/session.js` issues and verifies stateless 8-hour (`Max-Age=28800`) HMAC-SHA256 `HttpOnly; Path=/; SameSite=Lax` `admin_session` cookies (adding `Secure` on HTTPS or `X-Forwarded-Proto: https`).
  - Express (`src/routes/auth.js`, `src/app.js`) and Cloudflare Worker (`src/worker.js`, `wrangler.toml` `run_worker_first`) expose identical `POST /api/auth/login`, `GET /api/auth/session`, and `POST /api/auth/logout` contracts, serve `/login` (`document.title === "Login"`), redirect authenticated `GET /login` to `/products` (302), and redirect unauthenticated `GET /products`, `GET /brands`, and `GET /categories` to `/login` (302).
- **`product-dashboard`**:
  - `GET /` redirects (302) to `/dashboard` and `/dashboard` remains publicly accessible without authentication on both runtimes, loading `GET /api/products`, `GET /api/brands`, and `GET /api/categories` with HTTP 200 and preserving client-side sorting, availability/price/brand/category filtering, removable chips, and session wishlist toggles.
  - `web/src/App.jsx` and `web/src/components/AuthControl.jsx` render the right-aligned `.nav-auth` `Login` / `Logout` button after `Dashboard | Products | Brands | Categories`, navigating to `/login` when logged out and clearing the session via `POST /api/auth/logout` to open or remain on `/dashboard` when logged in, without polluting Dashboard catalog errors if `/api/auth/session` fails.
- **`product-management`, `brand-management`, and `category-management`**:
  - Express (`src/routes/products.js`, `src/routes/brands.js`, `src/routes/categories.js`) and Cloudflare Worker (`src/worker.js`) enforce `resolveAdmin` (`src/requireAdmin.js`) before all `POST`, `PUT`, and `DELETE` catalog handlers, returning HTTP 401 `{ "error": "Authentication required" }` (or HTTP 500 `{ "error": "SESSION_SECRET is not set" }` when unconfigured) with zero MongoDB mutations, while keeping collection `GET` routes and `GET /api/products/:id/image` public and preserving all existing field and delete-guard rules.
  - Client-side `AdminRoute` (`web/src/App.jsx`) renders `null` while session resolution is in flight and `<Navigate to="/login" replace />` when logged out, preventing management tables and add/edit/delete controls from rendering to unauthenticated visitors.

## Code quality

- Express and Cloudflare Worker runtime parity is maintained across authentication routes, `Set-Cookie` headers, `clientErrorMessage` 500 allowlisting, catalog write guards, and HTML document redirects (retaining the documented KI-002 405 and invalid-JSON parser split).
- Password hashing, login body parsing, cookie signing, admin resolution, and MongoDB `userinfo` persistence are cleanly modularized and shared across both runtimes without introducing new dependencies or HTTP user-management routes (`createUserinfo` is not imported by any route or Worker handler).
- Frontend components follow established repository conventions (`useEffect` with `cancelled` guard, `.message.error` user feedback, matching `.nav-auth` flex styling, and no external auth/state libraries).

## Security

- **Secrets and credentials**: No `MONGODB_URI`, `SESSION_SECRET`, `AUTH_BOOTSTRAP_PASSWORD`, `.env`, or `.dev.vars` secrets appear in the diff, source files, or `wrangler.toml`. `.env.example` and `.dev.vars.example` contain empty placeholders only. `SESSION_SECRET` shorter than 32 characters fails closed with HTTP 500 `"SESSION_SECRET is not set"`, and unexpected 500 errors remain masked as `"Request failed"`.
- **Input validation, cryptography, and injection**: `parseLoginBody` validates plain-object JSON bodies, single-identifier rules, username format (`^[A-Za-z0-9._-]{1,64}$`), email format (`<= 254` chars, single `@`, no whitespace), and non-empty passwords. PBKDF2-SHA256 digests and HMAC-SHA256 session signatures use `timingSafeEqual` on equal-length buffers. `admin_session` cookies set `HttpOnly`, `Path=/`, `SameSite=Lax`, and `Secure` over HTTPS, and all React views render text nodes with no `dangerouslySetInnerHTML`.
- **Dependencies**: No npm dependencies were added or upgraded (`package.json` updates only the `test` script file list; lockfiles are unchanged).

## Test evidence

- `openspec/changes/add-login-function/reports/test-report.md` records `Overall recommendation: PASS` across all 63 spec scenarios.
- Re-ran `npm test`: 59 passed, 0 failed (`web/src/catalogView.test.js`, `web/src/authView.test.js`, `src/productInput.test.js`, `src/productImage.test.js`, `src/auth.test.js`, `src/qa-scenarios.test.js`).
- Re-ran `node --test src/brand-qa.test.js`: 4 end-to-end brand/product/dashboard scenario suites passed, 0 failed.
- Re-ran `node --test src/login-qa.test.js`: 4 end-to-end authentication, runtime-parity, write-guard, category-CRUD, and routed-UI scenario suites passed, 0 failed.

## Findings

| ID | Severity | File | Finding | Resolution |
|---|---|---|---|---|
| F-01 | info | `src/store.js` | `toPublicUser`, `createUserinfo`, `findUserById`, and `authenticate` were inserted between `getProductImage`'s JSDoc comment (lines 926–932) and `export function getProductImage` (line 1022). | Non-blocking cosmetic comment placement; runtime behavior is unaffected. |
| F-02 | info | `openspec/changes/add-login-function/reports/test-report.md` | A few narrative descriptions in the QA scenario table use shorthand names (`pma_session`, `ADMIN_*`, `"Invalid credentials"`), while `src/login-qa.test.js` and the implementation test and enforce the exact `design.md` contracts (`admin_session`, `AUTH_BOOTSTRAP_*`, `"Invalid username, email, or password"`). | Non-blocking report prose discrepancy; automated test assertions match `design.md` and pass. |

**Decision:** APPROVED
**Pull request:** pending
