# Project Overview

**Last updated:** 2026-11-04
**Source of truth checked:** `README.md`, `package.json`, `openspec/config.yaml`, `openspec/specs/**`, `src/**`, `web/src/**`, `wrangler.toml`, `.env.example`, `.dev.vars.example`, `server.js`

## Purpose

`product-manage-app` is a small product catalog. A React app provides a storefront dashboard and three unauthenticated management pages. Express serves the same JSON API and HTML routes locally. A Cloudflare Worker serves the same API in deployment, with built pages from the assets binding. Products, brands, and categories are stored in MongoDB. The top navigation order is `Dashboard | Products | Brands | Categories`.

The word "administrator" appears in the OpenSpec UI scenarios. The code does not define accounts, roles, or a login gate.

## Users and primary jobs

| User | Job to be done |
|---|---|
| Storefront visitor | Browse `/dashboard`, filter and sort in the browser, toggle a session-only wishlist heart, click `BUY NOW` (no checkout). |
| Catalog editor | Create, update, and delete products at `/products`, including a required brand, an in-memory cart capped by stored quantity, and stock and publish toggles. |
| Catalog editor | Create, update, and delete brands at `/brands`. A brand that still has products cannot be deleted. |
| Catalog editor | Create, update, and delete categories at `/categories`. A category that still has products cannot be deleted. |

## In scope

- Product, brand, and category CRUD through `/api/products`, `/api/brands`, and `/api/categories`.
- Ten sample brands when the `brands` collection is empty, including when categories or products already exist.
- Starter categories and products when both of those collections are empty. Starter products reference Samsung, Sony, and Panasonic when those sample brands exist.
- Dashboard at `/dashboard`, with `GET /` redirecting to it. Brand filtering stays in the browser.
- Dual runtime: local Express (`src/app.js`) and Cloudflare Worker (`src/worker.js`) sharing `src/store.js`.

## Out of scope

Observed as absent from source and current main specs:

- Authentication, authorization, and user accounts.
- Pagination, search endpoints, and single-resource `GET /api/products/:id`, `GET /api/brands/:id`, or `GET /api/categories/:id`.
- Persisted cart, wishlist, checkout, or payment.
- A second database or a file-backed store in the running code (`data/db.json` is gitignored and not imported).

## Product surfaces

| Surface | Path / URL | Notes |
|---|---|---|
| Landing | `GET /` | HTTP 302 to `/dashboard` on both Express (`res.redirect`) and Worker (`Response.redirect`). Client route `/` also `Navigate`s to `/dashboard`. |
| Dashboard | `/dashboard` | Storefront. Loads `GET /api/products`, `GET /api/brands`, and `GET /api/categories` once, in parallel. Filters stay in memory. A failure of any of the three calls sets the error status. Brand fallback text is `Could not load brands`. |
| Products admin | `/products` | Table plus inline form and in-memory cart. Loads products, brands, and categories together. Brand column and Brand select sit immediately before Category. |
| Brands admin | `/brands` | Table plus inline form. Loads `GET /api/brands`. |
| Categories admin | `/categories` | Table plus inline form. Loads `GET /api/categories`. |
| Local server | `http://localhost:3000` | `server.js` uses `PORT` or 3000. `npm run dev` passes `--dev` so Vite middleware transforms `web/index.html`. |

## Related OpenSpec capabilities

| Capability | Spec path |
|---|---|
| product-management | `openspec/specs/product-management/spec.md` |
| brand-management | `openspec/specs/brand-management/spec.md` |
| category-management | `openspec/specs/category-management/spec.md` |
| product-dashboard | `openspec/specs/product-dashboard/spec.md` |

Archived change `openspec/changes/archive/2026-11-04-add-brand-manage/` is the source of the brand memory update. Archived `openspec/changes/archive/2026-11-02-product-dashboard/` is the earlier dashboard change. An active folder `openspec/changes/update-product-manage/` is present on this branch and was not part of this update.

## Open questions

- UNCONFIRMED: README says the admin layout follows json-config-server. `package.json` has no such dependency, and source does not import it. The products and categories forms use the CSS class `config-form`.
- UNCONFIRMED: whether unknown non-page paths must redirect on Express. The dashboard spec says unknown client paths go to `/dashboard`. Express registers `/`, `/dashboard`, `/products`, `/brands`, and `/categories`. The Worker assets binding uses `not_found_handling = "single-page-application"`, and `App.jsx` sends unknown client routes to `/dashboard` only after the HTML app has loaded.
