# Design

## Context

See `proposal.md` for why this change exists. The approved behavior is the delta specs under `specs/admin-authentication/spec.md`, `specs/product-dashboard/spec.md`, `specs/product-management/spec.md`, `specs/brand-management/spec.md`, and `specs/category-management/spec.md`. G1 left the Open questions section for this plan. That section has three numbered headings. Those headings contain seven decisions: a user-admin UI, a userinfo CRUD API, first-admin bootstrap, cookie versus bearer, session TTL, Dashboard control placement, and admin-page control placement. All seven are decided below. This document does not change the specs.

Today both runtimes call `src/store.js` through a per-request `MongoClient` (`withDatabase`). Express maps HTTP in `src/routes/products.js`, `src/routes/brands.js`, and `src/routes/categories.js` after `express.json()` in `src/app.js`. The Worker maps the same verbs in `src/worker.js` `handleApi`. `localEnv()` exposes only `MONGODB_URI` and `MONGODB_DB`. There is no session, cookie, password hash, or `userinfo` collection. Every page and every catalog verb is public (KI-003). `pagePaths` is `/dashboard`, `/products`, `/brands`, and `/categories`. The Worker runs before assets only for `/`, `/api`, and `/api/*` (`wrangler.toml` `run_worker_first`). `web/src/App.jsx` registers those four pages, sends every other client path to `/dashboard`, and sets `document.title` from `PAGE_TITLES`. The nav order is Dashboard, Products, Brands, Categories. `web/src/api.js` `requestJson` uses same-origin `fetch`, which sends cookies by default. `npm test` runs `web/src/catalogView.test.js`, `src/productInput.test.js`, `web/src/productImage.test.js`, and `src/qa-scenarios.test.js`. It does not run `src/brand-qa.test.js` (KI-001). The scenario harness stubs `MongoClient` and special-cases collation only for the field `name`.

Constraints that shape the approach:

- Express and the Worker must keep the same status codes and JSON bodies for this feature. Shared rules belong in modules both adapters call.
- `MONGODB_URI` and any new secret stay out of source, OpenSpec, and `wrangler.toml`. Express reads `.env`. The Worker reads `.dev.vars` locally and dashboard secrets in production. `nodejs_compat` is already on, with `compatibility_date` `2026-03-01`.
- No new npm dependency. Node 22 `node:crypto` (`pbkdf2`, `createHmac`, `timingSafeEqual`, `randomBytes`) is enough on both runtimes. A native password addon would not load on the Worker.
- The per-request Mongo client stays (ADR-002). A server-side session collection would add a write on every admin request and is not required for an HMAC cookie.
- Page HTML for a logged-out `/login` still comes from Vite or `web/dist`. This plan does not require `web/dist` to be present for `npm test`. Redirects are decided before `sendPage` and before `ASSETS.fetch`.
- Missing `MONGODB_URI` stays HTTP 500 `{ "error": "MONGODB_URI is not set" }`. Other 500 messages stay masked as `"Request failed"` unless this plan names them in the shared allowlist.
- KI-002 stays open. Express still has no 405 handler. Invalid JSON still uses the Express parser message on Express and `"Body must be JSON"` on the Worker.

## Goals / Non-Goals

**Goals:**

- Store administrator accounts in MongoDB collection `userinfo` with case-insensitive unique `username` and `email`, a PBKDF2 password hash, and no password material in API JSON.
- Serve `/login` on both runtimes, accept `username` + `password` or `email` + `password`, and move a successful login to `/products`.
- Establish an 8-hour stateless HMAC `HttpOnly` cookie that both runtimes issue and check with the same bytes.
- Reject unauthenticated catalog writes with HTTP 401 and redirect unauthenticated visits to `/products`, `/brands`, and `/categories` to `/login`, while `GET` catalog reads, `GET /`, and `/dashboard` stay public.
- Show one `Login` or `Logout` control on the right of the existing nav. Logout clears the cookie and opens `/dashboard`.
- Bootstrap the first admin from runtime environment values when `userinfo` is empty, without a default password in source.
- Cover the pure rules and the HTTP contracts with `node:test`, and keep the existing catalog field validators unchanged.

**Non-Goals:**

- A `/users` or `/userinfo` admin page, `/api/userinfo` CRUD, self-registration, password reset, roles, or a second administrator UI.
- A bearer token, `localStorage` session, server-side session collection, sliding expiration, or a CSRF token beyond `SameSite=Lax`.
- Closing KI-002 (Express 405 and invalid-JSON message text) or KI-005 (`indexesReady` is not keyed by database).
- Editing `proposal.md`, the delta specs, `.ai/memory/**`, or `approvals.md`. The memory-update stage writes any later ADR.
- Changing product, brand, or category field validation, seed data, dashboard filters, or `GET /api/products/:id/image`.

## Decisions

### Resolved questions from proposal.md

| # | Question left by G1 | Decision |
|---|---|---|
| 1 | Add an authenticated admin UI for accounts (`/users` or `/userinfo`)? | No. This change only stores accounts and checks them at login. |
| 2 | Add `/api/userinfo` create, read, update, and delete endpoints? | No. Nothing in the specs calls that API. The only writers are bootstrap and the store function tests call. |
| 3 | How is the first admin created when `userinfo` is empty, without a plaintext password in source? | When all three runtime values below are valid and the collection is empty, hash the password and insert one document. When they are absent, insert nothing. When they are partial or invalid and the collection is empty, login fails closed. |
| 4 | Stateless HMAC `HttpOnly` cookie, or a bearer token? | HMAC-signed `HttpOnly` cookie named `admin_session`. The browser sends it on same-origin navigation and `fetch`. A bearer token in `localStorage` would be readable by script. The `Authorization` header is ignored. |
| 5 | Browser session, 8 hours, or 24 hours? | Absolute 8 hours from issue time (`Max-Age=28800` and an `exp` claim). An expired, malformed, or badly signed cookie is unauthenticated. The cookie is not refreshed on later requests. |
| 6 | Where does `Login` / `Logout` sit on `/dashboard`? | In the existing top nav, after `Categories`, pushed to the right (`margin-left: auto`). It does not change the order `Dashboard \| Products \| Brands \| Categories` and it is not placed in the filter panel or product panel. |
| 7 | Where does that control sit on `/products`, `/brands`, and `/categories`? | The same nav control. Those pages do not get a second button in the `<h1>` header. Logout from any of them, or from `/dashboard`, clears the session and opens `/dashboard`. |

### 1. No account-management UI and no userinfo HTTP API

`userinfo` exists so `/login` can check credentials. There is no route that lists, creates, edits, or deletes accounts. A second admin is out of scope. An operator who must replace the only account removes the `userinfo` documents and restarts with new bootstrap values, or inserts a document that already uses the hash format in decision 3. `createUserinfo` is exported from `src/store.js` for bootstrap and tests. `src/routes/*` and `src/worker.js` must not call it.

**Alternatives considered:**

| Alternative | Why it was rejected |
|---|---|
| `/userinfo` table and `/api/userinfo` CRUD | Not in the approved specs. It would add another protected module and a way to create accounts from the browser before the session work is the goal of this change. |
| Hard-coded `admin` / `admin` document | Puts a working password in source. |
| Require a manual Mongo insert with no bootstrap | The open question asks for a bootstrap path that avoids plaintext in source. An empty collection with no env would leave login impossible after a normal deploy. |

### 2. Bootstrap one admin from runtime values

`localEnv()` and the Worker `env` gain these names. They are never written to `wrangler.toml`, source, or OpenSpec:

| Name | Role |
|---|---|
| `SESSION_SECRET` | HMAC key. Treated as missing when unset or shorter than 32 characters after trim. |
| `AUTH_BOOTSTRAP_USERNAME` | First admin username. |
| `AUTH_BOOTSTRAP_EMAIL` | First admin email. |
| `AUTH_BOOTSTRAP_PASSWORD` | First admin password. Hashed before insert. Never logged and never returned. |

`.env.example` and `.dev.vars.example` list the names with empty values and a comment that `SESSION_SECRET` must be at least 32 characters and that the bootstrap trio is set together. Placeholders stay empty so a copied example cannot sign cookies.

`ensureAdminBootstrap(db, env)` runs inside `withDatabase` after `ensureSeed`:

| Env state | `userinfo` count | Result |
|---|---|---|
| All three empty | any | No insert. Login of an unknown account is HTTP 401. |
| All three valid | 0 | Insert one hashed document. Swallow Mongo `11000` only. |
| All three valid | greater than 0 | No insert. Existing accounts stay as they are. |
| Any value set, and another missing or invalid | 0 | No insert. `authenticate` throws HTTP 500 `"Admin bootstrap configuration is incomplete"`. |
| Any value set, and another missing or invalid | greater than 0 | No insert. Existing accounts can still log in. |

Valid username: trimmed, 1 to 64 characters, matching `^[A-Za-z0-9._-]+$`. Valid email: trimmed, at most 254 characters, no whitespace, exactly one `@`, non-empty local part and domain (`admin@localhost` is allowed). Valid bootstrap password: trimmed length at least 8. Catalog `GET` requests do not turn a partial bootstrap into an error. Only `authenticate` raises the 500, and only when the collection is still empty.

The inserted id is `crypto.randomUUID()`. `createdAt` is an ISO timestamp. `updatedAt` is omitted. A concurrent pair of first requests may both see a count of 0. The unique index plus swallowing `11000` matches brand seed (KI-004). There is no transaction.

**Alternatives considered:**

| Alternative | Why it was rejected |
|---|---|
| Seed a fixed username in source and read only the password from the env | Still invents an account name the specs do not require, and a missing password is harder to see than a single incomplete-config error. |
| A CLI script as the only bootstrap | Express and the Worker would not share it, and the Worker deploy has no shell step that can reach Mongo. |
| Insert on every process start even when accounts exist | Would reset or duplicate the admin. The empty-collection gate matches `ensureBrandSeed`. |

### 3. Hash passwords with PBKDF2-SHA256

`src/password.js` uses `node:crypto` `pbkdf2` and `timingSafeEqual`. Stored form:

`pbkdf2-sha256$100000$<base64url salt>$<base64url digest>`

| Parameter | Value |
|---|---|
| Digest | SHA-256 |
| Iterations | 100000 |
| Salt | 16 random bytes |
| Output | 32 bytes |

`base64url` is unpadded. The plaintext password is the trimmed string. A stored value that does not match this form fails verification. Comparison uses `timingSafeEqual` on equal-length buffers. A length mismatch returns false and does not throw. When no account matches, verification still runs against a module-cached hash of the fixed string `invalid-user-timing-pad` so the 401 does not return on the lookup alone. That pad is not an account.

100000 iterations is the floor for this change. It is below the public OWASP PBKDF2-SHA256 figure because login runs on the Worker CPU budget. Catalog reads do not hash.

**Alternatives considered:**

| Alternative | Why it was rejected |
|---|---|
| `bcrypt` or another native addon | The Worker already aliases `mongodb-client-encryption` away for this reason. |
| SHA-256 of the password with no salt or iteration count | Too fast to keep, and identical passwords would share a hash. |
| 600000 iterations | Safer offline, and more likely to hit the Worker CPU limit on a login. |

### 4. Stateless HMAC cookie, 8-hour absolute TTL

`src/session.js` owns the cookie. Both adapters set the header string it returns. They do not call `res.cookie` and they do not add a cookie package.

| Piece | Value |
|---|---|
| Name | `admin_session` |
| Value | `<base64url payload>.<base64url hmac>` |
| Payload | `{"sub":"<user id>","exp":<unix seconds>}` with keys in that order |
| MAC | HMAC-SHA256 of the payload segment, key `SESSION_SECRET` |
| Lifetime | `exp = issueTime + 28800`. Valid only while `now < exp`. |
| Flags | `HttpOnly; Path=/; SameSite=Lax; Max-Age=28800` |
| `Secure` | Added only when the request URL is `https:` or `X-Forwarded-Proto` is `https`. Local `http://127.0.0.1` omits it. |
| Clear | `admin_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`, plus `Secure` on HTTPS |

`signSession(userId, secret, nowMs)` and `verifySession(token, secret, nowMs)` accept `nowMs` so tests do not sleep. `verifySession` returns the user id, or `null` for a bad shape, bad MAC, bad JSON, missing `sub`, or expired `exp`. `readCookie` takes the first `admin_session` value from a `Cookie` header.

Page redirects check the signature and `exp` only. They do not open Mongo. `GET /api/auth/session` and catalog writes also require the `userinfo` document to still exist.

The cookie is not sliding. A request at hour 7 does not move `exp`. Eight hours is long enough for an admin editing session and short enough that a copied cookie dies the same day. Twenty-four hours keeps a stolen cookie useful overnight. A browser session with no `exp` cannot satisfy the expired-credential scenario without a second clock.

**Alternatives considered:**

| Alternative | Why it was rejected |
|---|---|
| Bearer token in `localStorage` or `sessionStorage` | Any script on the origin can read it. Page loads would also need script before the server could refuse `/products`. |
| Server session row in Mongo | Extra write on each check, and the page redirect would need a database round trip. The Worker already opens a client per API call. |
| 24-hour or session cookie | The spec requires an expired credential to fail. A session cookie has no shared expiry across Express and the Worker. |

### 5. Login, session, and logout contracts

Routes, both runtimes:

| Method | Path | Auth | Success | Failure |
|---|---|---|---|---|
| POST | `/api/auth/login` | public | 200 `{ "user": { "id", "username", "email" } }` and `Set-Cookie` | 400, 401, or 500 below |
| GET | `/api/auth/session` | cookie optional | 200 `{ "authenticated": true, "user": { ... } }` or 200 `{ "authenticated": false }` | 500 when the secret or Mongo URI is missing and a signed cookie still has to be resolved |
| POST | `/api/auth/logout` | optional | 200 `{ "ok": true }` and a clearing `Set-Cookie` | none for a missing cookie |

`user` never includes `password`, `passwordHash`, salt, or iteration count. Logout does not need a valid cookie or the signing secret. It always clears the name and returns 200.

Login body, after JSON parse:

| Condition | Status | `error` |
|---|---|---|
| Body is not a plain object | 400 | `Body must be a JSON object` |
| No usable identifier | 400 | `Username or email is required` |
| More than one of `username`, `email`, and `account` is non-empty after trim | 400 | `Provide one username or email` |
| `username` fails the username pattern, or `account` has no `@` and fails that pattern | 400 | `Username is invalid` |
| `email` fails the email shape, or `account` contains `@` and fails that shape | 400 | `Email is invalid` |
| `password` missing, not a string, or blank after trim | 400 | `Password is required` |
| Secret missing | 500 | `SESSION_SECRET is not set` |
| Bootstrap incomplete and `userinfo` empty | 500 | `Admin bootstrap configuration is incomplete` |
| Unknown account or wrong password | 401 | `Invalid username, email, or password` |
| `MONGODB_URI` missing | 500 | `MONGODB_URI is not set` |

Identifier rules: a non-empty `account` with `@` is an email lookup; without `@` it is a username lookup. Explicit `username` and `email` are looked up on those fields. The password check uses the trimmed password. Unknown account and wrong password share one sentence so the API does not reveal which accounts exist.

`GET /api/auth/session` returns `{ "authenticated": false }` for a missing, expired, tampered, or unknown-user cookie when the secret is configured. It returns 500 `"SESSION_SECRET is not set"` when the secret is missing. The Dashboard must keep rendering the catalog when this call fails. The client treats a failed session call as logged out and does not put that failure into the catalog `.message.error`.

Catalog writes (`POST`, `PUT`, `DELETE` on `/api/products`, `/api/brands`, and `/api/categories`, including `/:id`) call `resolveAdmin` before reading a body and before any store mutation:

| Condition | Status | `error` |
|---|---|---|
| Secret missing | 500 | `SESSION_SECRET is not set` |
| Cookie missing, expired, tampered, or user id gone | 401 | `Authentication required` |

`GET` on those collections, and `GET /api/products/:id/image`, do not call `resolveAdmin`.

Worker methods other than the ones in the table, on a matched `/api/auth/...` path, stay HTTP 405 `{ "error": "Method not allowed" }`. Express still falls through to 404 `{ "error": "Not found" }` for an unsupported method (KI-002). Do not add an Express 405 branch.

Non-JSON login bodies stay on the current parsers: Worker 400 `"Body must be JSON"`, Express the existing `express.json()` error message. Both are 400 JSON, and neither sets a cookie.

`src/httpErrors.js` exports `clientErrorMessage(status, message)`. Status 500 stays raw only for `MONGODB_URI is not set`, `SESSION_SECRET is not set`, and `Admin bootstrap configuration is incomplete`. Every other 500 becomes `Request failed`. `apiError` and `errorResponse` both call it.

**Alternatives considered:**

| Alternative | Why it was rejected |
|---|---|
| 401 for a missing `SESSION_SECRET` | Hides a bad deploy behind the same body as a logged-out user. The Mongo URI already uses a dedicated 500 sentence. |
| 401 from `GET /api/auth/session` when logged out | The Dashboard loads that endpoint for a public page. A 401 would need a special case in `requestJson` to avoid looking like a catalog failure. `authenticated: false` is the public result. |
| 302 from `POST /api/auth/login` | The spec requires HTTP 200 JSON, then a browser redirect to `/products`. The React app performs that navigation. |

### 6. Page redirects and the client router

Server, both runtimes, before HTML is sent:

| Request | Valid unexpired cookie | Otherwise |
|---|---|---|
| `GET /products`, `GET /brands`, `GET /categories` | 200 HTML shell | 302 `Location: /login` |
| `GET /login` | 302 `Location: /products` | 200 HTML shell |
| `GET /dashboard` | 200 HTML shell | 200 HTML shell |
| `GET /` | 302 `Location: /dashboard` | 302 `Location: /dashboard` |

A missing secret takes the "otherwise" branch for these documents. It does not return a 500 HTML page and it does not render admin controls.

Express adds `/login` to `pagePaths` and branches before `sendPage`. The Worker checks these paths before `env.ASSETS.fetch`. `wrangler.toml` `run_worker_first` gains `/login`, `/products`, `/brands`, and `/categories` so the asset SPA cannot answer first. It does not gain a secret. `/dashboard` stays on the asset path.

The client still guards in-app `NavLink` clicks, which do not hit the document handler:

- `web/src/authPaths.js` exports `ADMIN_PATHS` (`/products`, `/brands`, `/categories`). The Express and Worker lists match it.
- `App.jsx` adds `<Route path="/login">` before `path="*"`, and sets `PAGE_TITLES["/login"]` to `Login`. The existing `useEffect` remains the only title writer. Unknown paths still redirect to `/dashboard`. `/login` is not one of them.
- While the session request is in flight, an admin route renders `null`. A resolved anonymous session renders `<Navigate to="/login" replace />`. A resolved admin session renders the existing page component.
- `/login` renders `null` while loading, `<Navigate to="/products" replace />` when authenticated, and `Login` otherwise.
- Dashboard children render immediately. They do not wait on the session request.

`web/src/components/Login.jsx` is a form with a `Username or email` field (`name="account"`, `autoComplete="username"`), a `Password` field (`type="password"`, `autoComplete="current-password"`), and a submit button whose text is `Login`. Errors from the API render in `<p className="message error">`. Submit always calls the API. On 200, `App` stores the user and navigates to `/products`.

`web/src/components/AuthControl.jsx` is a `<button type="button" className="nav-auth">` labeled `Login` or `Logout`. `Login` navigates to `/login`. `Logout` sends `POST /api/auth/logout`, then navigates to `/dashboard` and shows `Login` again. A failed logout shows `<p className="message error">` under the nav and does not claim the session is gone. `Dashboard.jsx`, `Products.jsx`, `Brands.jsx`, and `Categories.jsx` do not grow a second control.

`.nav` is already a flex row. `.nav-auth` uses `margin-left: auto` and the same height and padding as `.nav-link`. The four links stay in their current order.

**Alternatives considered:**

| Alternative | Why it was rejected |
|---|---|
| Client-only redirect | A document request for `/products` would still return the admin shell whenever JavaScript has not run the guard. The server 302 covers address-bar loads. The client guard covers `NavLink`. |
| Put `Login` in the Dashboard header only | The same control has to work on the admin pages, and the Dashboard omits the administrative `<h1>`. The nav is already on every page. |
| Insert `Login` into the link order | The specs require the menu order `Dashboard \| Products \| Brands \| Categories` to stay intact. |

### 7. `userinfo` document and lookups

Collection `userinfo`. API id is `_id`. The name is the spec name, not a pluralized `users` collection.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` / `_id` | string | yes | `crypto.randomUUID()` on create. |
| `username` | string | yes | Trimmed. Unique under `{ locale: "en", strength: 2 }`. Index `userinfo_username_ci`. |
| `email` | string | yes | Trimmed. Same collation. Index `userinfo_email_ci`. |
| `passwordHash` | string | yes | Decision 3. Never copied into JSON. |
| `createdAt` | string | yes | ISO timestamp. |
| `updatedAt` | string | no | Omitted on create. No update API in this change. |

`ensureIndexes` creates both indexes with the existing `nameCollation` before it sets `indexesReady`, and it still creates `category_name_ci` and `brand_name_ci`. A warm isolate that already set the flag does not create the new indexes until restart (KI-005).

Lookups use `findOne` with that collation. `toPublicUser` returns `{ id, username, email }` only.

`createUserinfo` pre-checks username and email, inserts, and maps a duplicate-key `11000` to HTTP 409 `"A user with that username or email already exists"`. That 409 is not an HTTP route. Bootstrap catches `11000` and continues. The in-memory harness does not enforce unique indexes, so the pre-check is what tests execute. The harness `matchesQuery` must treat `username` and `email` like `name` when collation strength is 2.

## Express and Worker parity

| Behavior | Express | Worker |
|---|---|---|
| Login, session, logout status and JSON | `src/routes/auth.js` | `handleApi` auth branch calling the same store and session helpers |
| `Set-Cookie` bytes | `res.append("Set-Cookie", session.header)` | The same header string on the `Response` |
| Catalog write 401 / secret 500 | `resolveAdmin` in the three routers, POST, PUT, and DELETE only | `resolveAdmin` at the start of those verbs only |
| Public `GET` lists and image `GET` | Unchanged | Unchanged |
| Admin document without a valid cookie | 302 `Location: /login` before `sendPage` | 302 before `ASSETS.fetch` |
| Authenticated `GET /login` | 302 `Location: /products` | Same |
| `GET /` | Existing 302 `/dashboard` | Existing 302 `/dashboard` |
| Missing `MONGODB_URI` | Existing 500 sentence, via `clientErrorMessage` | Same |
| Invalid JSON on login | Existing parser message | Existing `"Body must be JSON"` |
| Unsupported `/api/auth` method | 404 `"Not found"` (KI-002) | 405 `"Method not allowed"` |
| `Secure` cookie flag | Present only on HTTPS | Present only on HTTPS |
| HTML bytes for a permitted page | Vite or `web/dist` | `ASSETS` |

`run_worker_first` must include the four paths in decision 6. Without that, the Worker would serve the SPA for `/products` and the server-side 302 would never run.

## Security

- Secrets are `MONGODB_URI`, `SESSION_SECRET`, and `AUTH_BOOTSTRAP_PASSWORD`. Usernames and emails in the example files stay blank too. None of these values are written into `wrangler.toml`, source, tests-as-production-config, or this design. The test fixture secret is a string of at least 32 characters and is not the example value.
- `SESSION_SECRET` shorter than 32 characters is handled as missing.
- Password hashes use a random salt and PBKDF2. API JSON and thrown error messages do not include the hash, the bootstrap values, or the secret.
- The cookie is `HttpOnly` and `SameSite=Lax`. State-changing requests are same-origin `POST` with a JSON body. This app does not add CORS headers. That combination is the CSRF control for this change. There is no second credential in `localStorage`.
- Write handlers return 401 before a Mongo mutation. Page handlers redirect before the admin components render. The React admin route also renders nothing until `GET /api/auth/session` confirms the account.
- Account lookup errors and password errors share one 401 sentence.
- Names and server errors render as React text. Do not add `dangerouslySetInnerHTML`.
- `GET` catalog routes stay public on purpose so `/dashboard` can load without a session.
- A deleted `userinfo` row does not pass `resolveAdmin` or the session endpoint. The document 302 can still send the shell when the cookie signature is valid, and the client guard then leaves the admin page. Management controls are not rendered during that wait.

## Performance

- Catalog `GET` does not run PBKDF2. Bootstrap inserts at most once per empty collection, inside the connection `withDatabase` already opens.
- Login and an unknown-account 401 run one PBKDF2. Session `GET` is an HMAC check plus one `findOne` by `_id`.
- Each guarded write adds one `findOne` on its own per-request client, then the existing write opens another client. That matches ADR-002. This change does not cache a `MongoClient`.
- Page 302 work is HMAC verification only.
- `indexesReady` still skips later index creation in that isolate (KI-005).

## Risks / Trade-offs

- [An operator who deploys without bootstrap env cannot log in, and catalog writes stay at 401] → Login returns the shared 401, or the incomplete-config 500 when the trio is partial and `userinfo` is empty. Example files and the README say the three values are required together for the first account. Catalog `GET` stays public.
- [PBKDF2 at 100000 iterations can be slow or can hit a Worker CPU limit] → Hashing runs on login and on the one-time insert, not on dashboard reads. The iteration count stays 100000 rather than dropping it in a deployed env flag.
- [A stolen cookie works until `exp`] → `HttpOnly`, `SameSite=Lax`, and an 8-hour absolute cap. Logout clears it. There is no sliding renewal.
- [HTTPS sets `Secure` and local HTTP does not] → The flag follows the request scheme so localhost can keep the cookie. Payload, MAC, name, and `Max-Age` stay the same.
- [Two first requests both insert the bootstrap admin] → Unique indexes and a swallowed `11000`, same pattern as brand seed.
- [A warm process that already set `indexesReady` skips the new indexes] → Create them in `ensureIndexes` before the flag. A restart picks them up. KI-005 stays.
- [Existing scenario tests `POST`, `PUT`, and `DELETE` without a cookie] → The guard task updates `src/qa-scenarios.test.js` and `src/brand-qa.test.js` to log in first. `GET` tests stay anonymous.
- [`npm test` does not boot a real MongoDB or a real Worker] → The harness covers status codes. The verification group uses `npm run dev` when `MONGODB_URI` is available and records the skip in the development report when it is not.
- [Logged-out `GET /login` HTML is 200 only when Vite or `web/dist` can serve `index.html`] → Automated tests assert redirects, which do not need `web/dist`. The manual pass checks the Login title through `npm run dev`.
- [Express and the Worker still disagree on 405 and invalid-JSON text] → Left as KI-002. New auth tests assert the Worker strings and assert that Express is 400 JSON without a cookie, not a new shared sentence.
- [There is no in-app way to add a second admin or reset a lost password] → Accepted in decision 1. Replacing the account is an operator action outside this change.

## Migration Plan

Deploy the Express process and the Worker together. Before the Worker serves admin traffic, set `SESSION_SECRET` (at least 32 characters), `AUTH_BOOTSTRAP_USERNAME`, `AUTH_BOOTSTRAP_EMAIL`, and `AUTH_BOOTSTRAP_PASSWORD` as Worker secrets, and set the same names in local `.env` and `.dev.vars`. Do not add them under `[vars]`. The first API call with an empty `userinfo` collection inserts the one admin. Existing product, brand, category, and `productImages` documents stay as they are. `GET` catalog behavior is unchanged. Catalog writes start requiring the cookie as soon as this build is running, which is the break named in the proposal.

Rollback is reverting the application code and the `run_worker_first` path list. The previous build ignores `userinfo` and the cookie, and catalog writes are public again. Leave the `userinfo` collection in place. No down-migration script runs. Clear `AUTH_BOOTSTRAP_PASSWORD` from the host environment when the feature is rolled back so the password is not left in the process environment for a build that no longer reads it.

After G2 approval, implementation follows `tasks.md`. This stage does not change source.

## Dependencies

No new npm package.

| Package | Where | Use |
|---|---|---|
| `express` ^4.21.2 | root | Existing JSON parser, page routes, `Set-Cookie` |
| `mongodb` ^6.18.0 | root | `userinfo` collection and existing catalog collections |
| `node:crypto` | Node 22 and Worker `nodejs_compat` | PBKDF2, HMAC, random salt |
| `react` / `react-router-dom` | `web` | `/login` route, nav control, redirects |
| `vite`, `wrangler` | existing dev tooling | Unchanged, except the `run_worker_first` path list |

Node `>= 22`. Tests stay on `node:test`. The root `"test"` script gains `src/auth.test.js` and `web/src/authView.test.js`.

## Requirement mapping

Each scenario under a requirement is implemented by the same tasks as that requirement.

| Spec requirement | Tasks |
|---|---|
| admin-authentication: Store user accounts in MongoDB userinfo collection | 2.1, 2.2, 2.4, 3.5 |
| admin-authentication: Serve Login page at /login across runtimes | 3.3, 5.1, 5.2, 6.2 |
| admin-authentication: Authenticate with username or email and password | 1.1, 1.2, 1.3, 2.2, 2.3, 3.1, 3.2, 3.5 |
| admin-authentication: Enforce administrator session on management views and write APIs | 3.3, 4.1, 4.2, 4.3, 5.2 |
| admin-authentication: Administrator logout opens Dashboard page | 3.1, 3.2, 3.5, 5.2 |
| product-dashboard: Login and Logout controls on the Dashboard page | 5.1, 5.2, 6.2 |
| product-dashboard: Unauthenticated public access to Dashboard | 4.1, 4.2, 5.2, 6.1 |
| product-dashboard: Dashboard route and landing page redirect | 3.3, 5.2, 6.3 |
| product-management: Require administrator authentication to manage products | 3.3, 4.1, 4.2, 4.3, 5.2 |
| product-management: Create product with validated fields | 4.1, 4.3 |
| product-management: Update existing product | 4.1, 4.3 |
| product-management: Delete existing product | 4.1, 4.3 |
| product-management: Products administrative UI | 4.3, 5.2 |
| brand-management: Require administrator authentication to manage brands | 3.3, 4.1, 4.2, 4.3, 5.2 |
| brand-management: Create brand with unique case-insensitive name | 4.1, 4.3 |
| brand-management: Update existing brand | 4.1, 4.3 |
| brand-management: Delete empty brand only | 4.1, 4.3 |
| brand-management: Brands administrative UI and navigation order | 4.3, 5.2 |
| category-management: Require administrator authentication to manage categories | 3.3, 4.1, 4.2, 4.3, 5.2 |
| category-management: Create category with unique case-insensitive name | 4.1, 4.3 |
| category-management: Update existing category | 4.1, 4.3 |
| category-management: Delete empty category only | 4.1, 4.3 |
| category-management: Categories administrative UI | 4.3, 5.2 |

Product, brand, and category create, update, and delete field rules stay in `src/store.js` and are not edited. Task 4.3 keeps those scenario tests, and adds a cookie so they still reach the store. `GET /api/products`, `GET /api/brands`, and `GET /api/categories` stay unauthenticated, which is what the Dashboard filter scenarios use. `GET /` stays a 302 to `/dashboard` on both hosts.

## Open Questions

None. The seven decisions in the proposal's Open questions section are recorded above. `tasks.md` can be written from these decisions without a further product choice.
