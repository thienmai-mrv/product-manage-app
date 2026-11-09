# Development Report: add-login-function

**Developer agent:** cursor
**Branch:** feature/add-login-function
**Iteration:** 1

## Summary

Implemented the G2 login design: PBKDF2 password hashes, a `userinfo` store with env bootstrap, an 8-hour HMAC `admin_session` cookie, Express and Worker auth routes, admin document redirects, catalog write guards, and a `/login` page with a nav Login/Logout control. The Dashboard stays public. No account-management page or user API was added.

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

## Implementation decisions

- Shared cookie, secret, login parsing, and error masking live in modules both adapters call. Express still has no 405 handler for `/api/auth` (KI-002). The Worker returns 405 for any other method on the three auth paths.
- Page redirects check the HMAC and `exp` only. `GET /api/auth/session` and catalog writes also require the `userinfo` row.
- `ensureAdminBootstrap` runs inside `withDatabase` after `ensureSeed`. Catalog list functions do not throw when the bootstrap trio is partial.
- Unknown-account login verifies a cached hash of `invalid-user-timing-pad` before the shared 401.
- Existing catalog write tests log in once per test and attach `admin_session` on `/api/products`, `/api/brands`, and `/api/categories` POST, PUT, and DELETE. GET stays anonymous. The Worker `/brands` asset assertion sends the same cookie so the new document redirect does not hide the asset response.

## Tests

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
