# Development Report: add-login-function

**Developer agent:** cursor
**Branch:** feature/add-login-function
**Iteration:** 3

## Summary

Iteration 3 hides Products, Brands, and Categories until login, puts the signed-in admin pages in a sidebar shell, centers the login card, and uses one loading spinner on the dashboard, the admin lists, and the session check.

Iteration 2 fixes the three open QA defects without un-archiving the change. Logout from an admin page keeps the signed-in user until `/dashboard` commits, so `AdminRoute` does not replace that navigation with `/login`. Below 640px the nav wraps, leaving Dashboard, Products, Brands, Categories, and the auth control on screen. The login form uses `config-form` and a `primary` submit button, matching the product, brand, and category forms. Desktop nav placement is unchanged: one `.nav-auth` control after Categories with `margin-left: auto`.

Iteration 1 implemented the G2 login design: PBKDF2 password hashes, a `userinfo` store with env bootstrap, an 8-hour HMAC `admin_session` cookie, Express and Worker auth routes, admin document redirects, catalog write guards, and a `/login` page with a nav Login/Logout control. The Dashboard stays public. No account-management page or user API was added.

## Changed files

| File | Change | Task |
|---|---|---|
| `src/password.js` | PBKDF2-SHA256 hash and verify | 1.1 |
| `src/auth.test.js` | Password, login parser, session, and error-mask tests | 1.1, 1.2, 1.3, 3.1 |
| `package.json` | Root `test` script includes `src/auth.test.js` and `web/src/authView.test.js` | 1.1, 5.1 |
| `src/loginInput.js` | Login body parser and shared username/email rules | 1.2, 2.3 |
| `src/session.js` | Sign, verify, read, and Set-Cookie header | 1.3, 3.1, 3.3 |
| `src/store.js` | `userinfo` indexes, bootstrap, create, find, and authenticate | 2.1, 2.2, 2.3 |
| `src/env.js` | Empty defaults for the session secret and bootstrap trio | 2.3 |
| `src/qa-scenarios.test.js` | Case-insensitive user fields, bootstrap cases, auth HTTP cases, and admin cookie on catalog writes | 2.4, 3.5, 4.3 |
| `src/httpErrors.js` | Shared 500 allowlist | 3.1 |
| `src/routes/auth.js` | Express login, session, and logout | 3.1 |
| `src/app.js` | Mount auth routes, mask errors, redirect admin pages and authenticated `/login` | 3.1, 3.3 |
| `src/worker.js` | Same auth JSON, Set-Cookie, write guards, and document redirects | 3.2, 3.3, 4.2 |
| `wrangler.toml` | `run_worker_first` includes `/login`, `/products`, `/brands`, and `/categories` | 3.3 |
| `README.md` | Auth routes and the catalog write-cookie note | 3.4 |
| `.env.example`, `.dev.vars.example` | Empty secret and bootstrap names | 3.4 |
| `src/requireAdmin.js` | `resolveAdmin` | 4.1 |
| `src/routes/products.js`, `src/routes/brands.js`, `src/routes/categories.js` | `resolveAdmin` on POST, PUT, and DELETE only | 4.1 |
| `src/brand-qa.test.js` | Admin cookie on catalog writes; Worker `/brands` asset check sends that cookie | 4.3 |
| `web/src/authPaths.js` | `ADMIN_PATHS` | 5.1 |
| `web/src/components/AuthControl.jsx`, `web/src/components/Login.jsx` | Nav control and login form | 5.1 |
| `web/src/index.css` | `.nav-auth` | 5.1 |
| `web/src/authView.test.js` | Static markup for Login, Logout, the form error, and `ADMIN_PATHS` | 5.1 |
| `web/src/App.jsx` | `/login` route, session load, admin guard, and logout | 5.2 |
| `openspec/changes/add-login-function/tasks.md` | Checkboxes marked complete | 6.1 |
| `openspec/changes/add-login-function/reports/development-report.md` | This report | 6.2, 6.3 |
| `web/src/App.jsx` | Iteration 2: clear the user only after `/dashboard` commits (DEF-001) | 5.2 |
| `web/src/index.css` | Iteration 2: wrap `.nav` below 640px (DEF-002) | 5.1 |
| `web/src/components/Login.jsx` | Iteration 2: `config-form` and `primary` submit (DEF-003) | 5.1 |
| `web/src/logoutRedirect.test.js` | Iteration 2: admin logout must finish on `/dashboard` when the session clear renders first | 5.2 |
| `web/src/authView.test.js` | Iteration 2: login form classes and the narrow nav wrap rule | 5.1 |
| `package.json` | Iteration 2: `npm test` includes `web/src/logoutRedirect.test.js` | 5.2 |
| `web/src/App.jsx` | Iteration 3: hide admin links until login, and render the admin sidebar | 5.2 |
| `web/src/index.css` | Iteration 3: `.page-admin`, `.page-login`, and `.loading-state` | 5.1 |
| `web/src/components/Login.jsx` | Iteration 3: login card around the existing form | 5.1 |
| `web/src/components/LoadingState.jsx` | Iteration 3: shared spinner and label | 5.1 |
| `web/src/components/ProductPanel.jsx` | Iteration 3: dashboard loading spinner | 5.1 |
| `web/src/components/Products.jsx` | Iteration 3: product list spinner and status pills | 5.1 |
| `web/src/components/Brands.jsx` | Iteration 3: brand list spinner | 5.1 |
| `web/src/components/Categories.jsx` | Iteration 3: category list spinner | 5.1 |
| `README.md` | Iteration 3: signed-out nav, admin shell, login card, and loading labels | 6.2 |
| `src/brand-qa.test.js` | Iteration 3: signed-out static nav is Dashboard only, and the admin shell class is `page page-wide page-admin` | 5.2 |
| `src/login-qa.test.js` | Iteration 3: signed-out nav is Dashboard, and the signed-in order is unchanged | 5.2 |

## Implementation decisions

- Shared cookie, secret, login parsing, and error masking live in modules both adapters call. Express still has no 405 handler for `/api/auth` (KI-002). The Worker returns 405 for any other method on the three auth paths.
- Page redirects check the HMAC and `exp` only. `GET /api/auth/session` and catalog writes also require the `userinfo` row.
- `ensureAdminBootstrap` runs inside `withDatabase` after `ensureSeed`. Catalog list functions do not throw when the bootstrap trio is partial.
- Unknown-account login verifies a cached hash of `invalid-user-timing-pad` before the shared 401.
- Existing catalog write tests log in once per test and attach `admin_session` on `/api/products`, `/api/brands`, and `/api/categories` POST, PUT, and DELETE. GET stays anonymous. The Worker `/brands` asset assertion sends the same cookie so the new document redirect does not hide the asset response.

## Tests (iteration 1)

| Command | Result |
|---|---|
| `npm test` | Exit 0. 59 tests passed. |
| `node --test src/brand-qa.test.js` | Exit 0. 4 tests passed. |

## Deviations from design.md

None.

## Known limitations

- Manual Express verification (`npm run dev` against `/login`, username and email login, wrong password, logged-out admin routes, public Dashboard filters, nav Login/Logout, and a rejected catalog POST after logout) was not run. `.env` is absent, so `MONGODB_URI` and a `SESSION_SECRET` of at least 32 characters were not available.
- Live Worker preview was skipped. `.dev.vars` is absent.
- Express and Worker `Location` headers for `GET /` stay as they were: Express sends a relative `/dashboard`, and the Worker sends an absolute URL whose path is `/dashboard`. The new `/login` and `/products` redirects follow that same host split.
- KI-002 remains. Express has no 405 for unsupported auth methods, and a non-JSON login body keeps the Express parser message. The Worker uses `Body must be JSON` and 405.
- KI-005 remains. A warm isolate that already set `indexesReady` does not create the new `userinfo` indexes until restart.
- There is still no in-app way to add a second admin or reset a password.

## Iteration 2

### Decisions

- `handleLogout` still posts `/api/auth/logout` and then opens `/dashboard`. On `/products`, `/brands`, and `/categories` the signed-in user stays set until that location commits. `AdminRoute` therefore does not mount `<Navigate to="/login">` while the admin URL is still current. Logout from `/dashboard` clears the user immediately. A failed logout still does not clear the user.
- Narrow layout uses the existing `max-width: 639px` breakpoint. `.nav` wraps there. `.nav-auth` stays after Categories with `margin-left: auto` at every width, and it is not added to the filter panel or the page heading.
- The login form reuses `.config-form` and `.primary` instead of a new stylesheet.

### Tests

| Command | Result |
|---|---|
| `npm test` | Exit 0. 61 tests passed. |
| `node --test src/login-qa.test.js` | Exit 0. 4 tests passed. |
| `npm run workflow:verify -- add-login-function developer` | Exit 0. `verify developer: OK`. |

### Deviations from design.md

None.

### Known limitations

- This iteration did not re-open Chrome at 390px. DEF-001 is covered by `web/src/logoutRedirect.test.js`, which fails if logout from an admin page still finishes on `/login`. DEF-002 and DEF-003 are covered by the nav rule and the login form markup assertions.
- Express and Worker auth behavior was not changed. The iteration 1 host differences and KI-002, KI-005, and the missing second-admin flow remain.

## Iteration 3

### Decisions

- Products, Brands, and Categories stay out of the navigation until `GET /api/auth/session` returns a user. Direct visits to those URLs still redirect to `/login` when the visitor is signed out. After login the order is Dashboard, Products, Brands, Categories.
- Signed-in `/products`, `/brands`, and `/categories` use `page page-wide page-admin`. The sidebar is sticky, and Logout sits at its bottom. Below 960px the sidebar becomes a wrapping top bar.
- `/login` keeps `config-form` and the `primary` submit button, and wraps them in `.login-card` on `.page-login`.
- `LoadingState` is the only loading indicator. The dashboard label stays `Loading products…`. Admin lists use `Loading products…`, `Loading brands…`, and `Loading categories…`. The session check uses `Loading…`.

### Tests

| Command | Result |
|---|---|
| `node --test --test-name-pattern "Brands administrative UI" src/brand-qa.test.js` | Exit 0. |
| `node --test web/src/authView.test.js web/src/logoutRedirect.test.js src/brand-qa.test.js` | Exit 0 before the loading spinner. The brands UI test was re-run after the spinner and passed. |
| Chrome at 1440px and 390px | Signed-in Products, Brands, and Categories stay inside the viewport. The spinner is visible on the dashboard, the products shell, and `/login` while those requests are held. |

### Deviations from design.md

- Signed-out navigation no longer shows Products, Brands, and Categories. The approved design kept those links visible and redirected the click to `/login`.

### Known limitations

- Express and Worker auth behavior was not changed. The iteration 1 host differences and KI-002, KI-005, and the missing second-admin flow remain.
