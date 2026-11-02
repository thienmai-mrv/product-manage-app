# API: pages

**Last updated:** 2026-11-02
**Handlers:** Express `src/app.js` · Worker `src/worker.js` `route` plus ASSETS

These are HTML routes, not JSON resources. Unknown `/api` paths are documented here because they sit beside the page router.

## Endpoints

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/` | none | 302 `Location: /dashboard` | |
| GET | `/dashboard` | none | 200 HTML | Express: Vite-transformed `web/index.html` or `web/dist/index.html`. Worker: asset fetch. |
| GET | `/products` | none | 200 HTML | Same shell. React renders the products page. |
| GET | `/categories` | none | 200 HTML | Same shell. React renders the categories page. |
| GET | any other non-API path | none | Worker: SPA fallback can return `index.html`, then the client redirects to `/dashboard`. Express: no page handler is registered. | Worker 500 text `ASSETS binding is not configured for this deployment.` when `env.ASSETS.fetch` is missing. |
| any | `/api` and unknown `/api/*` | | | 404 `{ "error": "Not found" }` on both hosts when the product and category patterns do not match. |
| OPTIONS | `/api` and `/api/*` | none | Worker 204 empty body | Express has no OPTIONS route. |

`pagePaths` in `src/app.js` is exactly `/dashboard`, `/products`, `/categories`.

## Shared contract rules

- The React app registers the same three pages plus redirects for `/` and `*`.
- `document.title` is set in the browser from the path. Initial HTML title is `Products`.
- Dashboard omits the admin header. Products and Categories render `<h1>`.
- API routes are registered before static files and page routes on Express, and before ASSETS on the Worker.

## Parity notes

Must match on Express and Worker. See [runtime-parity.md](../runtime-parity.md).

`wrangler.toml` sets `run_worker_first` for `/`, `/api`, and `/api/*`, and `not_found_handling = "single-page-application"`.

## Examples

### Success

`GET /` response status is 302. The JSON APIs are not used for this redirect.

### Error

```json
{ "error": "Not found" }
```
