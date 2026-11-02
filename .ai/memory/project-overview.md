# Project Overview

**Last updated:** 2026-11-02
**Source of truth checked:** `README.md`, `package.json`, `openspec/config.yaml`, `openspec/specs/**`, `src/**`, `web/src/**`, `wrangler.toml`, `.env.example`, `.dev.vars.example`, `server.js`

## Purpose

`product-manage-app` is a small product catalog. A React app provides a storefront dashboard and two unauthenticated management pages. Express serves the same JSON API and HTML routes locally. A Cloudflare Worker serves the same API in deployment, with built pages from the assets binding. Products and categories are stored in MongoDB.

The word "administrator" appears in the OpenSpec UI scenarios. The code does not define accounts, roles, or a login gate.

## Users and primary jobs

| User | Job to be done |
|---|---|
| Storefront visitor | Browse `/dashboard`, filter and sort in the browser, toggle a session-only wishlist heart, click `BUY NOW` (no checkout). |
| Catalog editor | Create, update, and delete products at `/products`, including an in-memory cart capped by stored quantity. |
| Catalog editor | Create, update, and delete categories at `/categories`. A category that still has products cannot be deleted. |

## In scope

- Product and category CRUD through `/api/products` and `/api/categories`.
- Starter catalog when both Mongo collections are empty.
- Dashboard at `/dashboard`, with `GET /` redirecting to it.
- Dual runtime: local Express (`src/app.js`) and Cloudflare Worker (`src/worker.js`) sharing `src/store.js`.

## Out of scope

Observed as absent from source and current main specs:

- Authentication, authorization, and user accounts.
- Pagination, search endpoints, and single-resource `GET /api/products/:id` or `GET /api/categories/:id`.
- Persisted cart, wishlist, checkout, or payment.
- A second database or a file-backed store in the running code (`data/db.json` is gitignored and not imported).

## Product surfaces

| Surface | Path / URL | Notes |
|---|---|---|
| Landing | `GET /` | HTTP 302 to `/dashboard` on both Express (`res.redirect`) and Worker (`Response.redirect`). Client route `/` also `Navigate`s to `/dashboard`. |
| Dashboard | `/dashboard` | Storefront. Loads `GET /api/products` once. Filters stay in memory. |
| Products admin | `/products` | Table plus inline form and in-memory cart. Loads products and categories together. |
| Categories admin | `/categories` | Table plus inline form. Loads `GET /api/categories`. |
| Local server | `http://localhost:3000` | `server.js` uses `PORT` or 3000. `npm run dev` passes `--dev` so Vite middleware transforms `web/index.html`. |

## Related OpenSpec capabilities

| Capability | Spec path |
|---|---|
| product-management | `openspec/specs/product-management/spec.md` |
| category-management | `openspec/specs/category-management/spec.md` |
| product-dashboard | `openspec/specs/product-dashboard/spec.md` |

Archived change `openspec/changes/archive/2026-11-02-product-dashboard/` matches the current dashboard spec. No active change folder was present at init.

## Open questions

- UNCONFIRMED: README says the admin layout follows json-config-server. `package.json` has no such dependency, and source does not import it. The products and categories forms use the CSS class `config-form`.
- UNCONFIRMED: whether unknown non-page paths must redirect on Express. The dashboard spec says unknown client paths go to `/dashboard`. Express only registers `/`, `/dashboard`, `/products`, and `/categories`. The Worker assets binding uses `not_found_handling = "single-page-application"`, and `App.jsx` sends unknown client routes to `/dashboard` only after the HTML app has loaded.
