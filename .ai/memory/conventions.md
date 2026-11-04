# Conventions

**Last updated:** 2026-11-04

## Repository layout

| Path | Role |
|---|---|
| `src/` | Express app, Worker entry, shared store, route adapters. |
| `web/src/` | React UI. Components in `web/src/components/`. Pure dashboard logic in `catalogView.js`. |
| `web/dist/` | Build output. Gitignored. |
| `openspec/specs/` | Main capability specs. |
| `openspec/changes/` | Active changes. `archive/` holds finished ones. |
| `.ai/memory/` | Project memory. Feature agents read it. Only memory init/update agents write it. |
| `.orca/agents/` | Role prompts for the workflow. |
| `scripts/` | Web build, Windows Node switch, workflow checks. |
| `docs/workflow/` | Coordinator runbook and agent assignments. |

## Naming

| Kind | Convention | Example |
|---|---|---|
| Source modules | camelCase `.js` / `.jsx` | `catalogView.js`, `Products.jsx` |
| API collections | plural nouns | `/api/products`, `/api/brands`, `/api/categories` |
| Mongo collections | same plural names | `products`, `brands`, `categories` |
| API id field | `id` | mapped from Mongo `_id` |
| OpenSpec change | kebab-case | archived `product-dashboard` |
| Feature branch | `feature/<change>` | required for feature agents by `AGENTS.md` |
| Memory decisions | `NNN-kebab-title.md` | `decisions/001-dual-express-worker-runtime.md` |

## API style

- JSON only. Success list is `{ "items": [...] }`. Create and update return `{ "item": ... }`. Delete returns `{ "deleted": true }`.
- Create is HTTP 201. Update and delete are HTTP 200.
- Errors are `{ "error": "<message>" }` with an HTTP status on the store error.
- No trailing resource GET-by-id. Collection `GET` returns every document, newest `createdAt` first.
- Ids in paths are `decodeURIComponent`'d on the Worker. Express uses `req.params.id`.

## Error responses

- 400 validation (`Name is required`, `Brand is required`, `Brand not found`, `Category is required`, `Category not found`, price, image, quantity, Worker non-JSON body).
- 404 missing product, brand, or category on update/delete, or unknown `/api` path on Express.
- 409 brand or category name conflict, or brand or category delete while products remain. Brand conflict text is `A brand with that name already exists`. Brand delete text is `Move or delete products in this brand first`.
- 500 missing `MONGODB_URI` keeps the message `MONGODB_URI is not set`. Other 500s become `Request failed`.
- Worker unsupported method on a matched API path returns 405 `{ "error": "Method not allowed" }`.
- Worker `OPTIONS` under `/api` returns 204 with an empty body and no CORS headers.

## Frontend patterns

- Pages load data in `useEffect` with a cancelled flag. They do not use a data library.
- User-facing API failures render `<p className="message error">`.
- Dashboard filter logic stays in `catalogView.js` so `node:test` can cover it without rendering React.
- Admin save prepends a created row or replaces the edited row in React state. It does not refetch.
- Delete asks `window.confirm`.
- Navigation is `NavLink` in order `/dashboard`, `/products`, `/brands`, `/categories`. Dashboard omits the `<h1>` header. Products, Brands, and Categories render `<h1>`.

## Git and branches

- Feature branches: `feature/<change>`
- Never commit to `main` from a feature agent
- Do not commit `.env`, `.dev.vars`, or `data/db.json` (all gitignored).

## Documentation

- Feature specs live in OpenSpec
- Project knowledge lives in `.ai/memory/`
- JSDoc on exported functions and non-obvious component helpers is the local comment style.
- Memory facts should cite paths. Mark gaps `UNCONFIRMED:`.

## Forbidden shortcuts

- Diverging Express and Worker JSON contracts.
- Putting `MONGODB_URI` in `wrangler.toml` or in memory files.
- Treating In Stock Only as a no-op. `productIsInStock` excludes `inStock === false`.
- Adding color swatches or weight sorts during a brand change. The dashboard spec still describes them, and the current filter panel does not. See KI-007.
- Adding application features during memory init or memory update.
