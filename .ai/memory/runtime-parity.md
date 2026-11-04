# Runtime Parity (Express ↔ Worker)

**Last updated:** 2026-11-04

## Rule

Every route and API behavior change MUST work identically in:

- Local Express: `src/app.js` (+ `src/routes/*`)
- Cloudflare Worker: `src/worker.js`

Both call `src/store.js`. HTTP mapping is duplicated and must be updated in both places.

## Shared modules

| Module | Path | Shared by |
|---|---|---|
| Store and validation | `src/store.js` | Express routes and Worker |
| React UI | `web/src/**` | Express (Vite or `web/dist`) and Worker assets |
| Built assets | `web/dist` | Express static middleware and Worker `[assets]` binding `ASSETS` |

Not shared: Express uses `src/env.js` `localEnv()` after reading `.env`. The Worker receives `env` from Wrangler (`.dev.vars` locally, dashboard secret in production). `src/routes/*` and `src/asyncRoute.js` are Express-only. `src/worker.js` is Worker-only.

## Divergence map (must stay empty or justified)

| Behavior | Express | Worker | Status |
|---|---|---|---|
| API CRUD status and JSON bodies for the happy path and store errors | Routers in `src/routes` | `handleApi` in `src/worker.js` | Aligned. Both delegate to the same store functions. |
| Missing `MONGODB_URI` | `apiError` keeps that message on 500 | `errorResponse` keeps that message on 500 | Aligned. |
| Other 500 messages | Replaced with `Request failed` | Same | Aligned. |
| `GET /` | `res.redirect("/dashboard")` (302) | `Response.redirect(..., 302)` | Aligned. |
| Page HTML | Vite in dev, else `web/dist` for `/dashboard`, `/products`, `/brands`, `/categories` only | `env.ASSETS.fetch` with SPA fallback; Worker runs first for `/`, `/api`, `/api/*`. `/brands` is not a Worker HTML route. | Justified by host. Unknown paths differ. See known issues. |
| Unsupported API method | No 405 handler. Unmatched router methods fall through toward `app.use("/api")`, which returns 404 `{ "error": "Not found" }`. | 405 `{ "error": "Method not allowed" }` when the product, category, or brand regex matches. | Open gap. add-brand-manage kept this split (KI-002). |
| Invalid JSON body | `express.json()` error is passed to `apiError`, which returns `error.message`. | Fixed 400 `"Body must be JSON"`. | Open gap. Exact Express message text was not executed during init. |
| `OPTIONS /api/*` | No dedicated handler. | 204 empty body, no CORS headers. | Justified for same-origin use. No spec requires CORS. |
| Static title before hydration | Same `web/index.html` (`Products`) then React updates it | Same built file | Aligned. |

## Checklist for every API/route change

- [ ] Express handler updated
- [ ] Worker handler updated the same way
- [ ] Status codes and JSON body shapes match
- [ ] Missing `MONGODB_URI` still returns HTTP 500 `{ "error": "MONGODB_URI is not set" }`
- [ ] No secret written to `wrangler.toml`
- [ ] New page path added in `web/src/App.jsx` and in Express `pagePaths`
- [ ] Store validation stays in `src/store.js`, not copied into only one adapter

## Verification tips

- Compare `src/routes/products.js`, `src/routes/brands.js`, `src/routes/categories.js`, and `handleApi` in `src/worker.js` after any verb or status change.
- `npm test` does not boot Express, the Worker, or MongoDB. Parity of HTTP status codes is currently a code-review check.
- Worker local secrets belong in `.dev.vars`. Express reads `.env`. Both names are `MONGODB_URI` and `MONGODB_DB`.
