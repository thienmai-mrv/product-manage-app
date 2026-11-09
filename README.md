# product-manage-app

Sample product catalog with a React frontend and an Express backend. Express serves the JSON API and the Dashboard, Login, Product, Brand, and Category pages. The same API runs on a Cloudflare Worker for deployment. Signed-in admin pages use a sidebar shell. The storefront dashboard stays a separate public page.

Products and categories are stored in MongoDB. `MONGODB_URI` is an environment secret and is never written into `wrangler.toml`.

## Local

Copy `.env.example` to `.env` and set `MONGODB_URI` to your Atlas connection string. `MONGODB_DB` defaults to `productmanage`.

```bash
npm install
npm run dev
```

Open http://localhost:3000. `/` redirects to `/dashboard`. The first API call creates the sample categories and products when both collections are empty.

A signed-out visitor sees Dashboard and Login. Products, Brands, and Categories appear in the navigation only after the session check confirms an admin. `/login` is a centered card. Products, Brands, and Categories use a dark sidebar with Logout at the bottom, and a content column with the page title and table. Below 960px that sidebar becomes a top bar. While a page is waiting on data, it shows the shared spinner: `Loading products…` on the dashboard, `Loading brands…` and `Loading categories…` on those lists, and `Loading…` while the session check is still in progress.

`npm start` builds the React app and serves `web/dist` without the Vite dev server. It reads the same `.env` file.

This project expects Node 22. `.nvmrc` is `22`.

## Cloudflare Worker

Deploy from Node 22:

```bash
npm run deploy
```

`npm run deploy` switches to Node 22 with nvm, builds the React app, then runs `wrangler deploy`. `npm run preview` does the same for a preview deployment. `npm run dev:worker` runs the Worker locally.

Before the first deploy, set the secret:

1. Deploy once so the Worker exists: `npm run deploy`
2. Open **Workers & Pages → product-manage-app → Settings → Variables and Secrets**
3. Choose **Add**
4. Type: **Secret**
5. Name: `MONGODB_URI`
6. Value: your Atlas connection string
7. Save. Cloudflare redeploys the Worker with the secret bound to `env.MONGODB_URI`

`MONGODB_DB` is a plain variable in `wrangler.toml` (`productmanage`). Change it there for a different database.

For local Worker development, copy `.dev.vars.example` to `.dev.vars` and fill in `MONGODB_URI`. `.dev.vars` is only for Wrangler. Production still uses the Settings secret.

In Atlas **Network Access**, allow `0.0.0.0/0`. Workers do not have a fixed outbound IP.

`wrangler preview` does not inherit production secrets. Set the preview secret with `npx wrangler preview secret put MONGODB_URI`.

## Development workflow

Features are delivered by specialized agents orchestrated by Orca Desktop, specified in OpenSpec, and executed on Cursor CLI, with human approval gates. Shared project knowledge lives in [`.ai/memory/`](.ai/memory/README.md) so agents do not re-analyze the codebase from scratch each feature. See [AGENTS.md](AGENTS.md) and [docs/workflow/README.md](docs/workflow/README.md).

## Routes

| Method | Path | Body |
|---|---|---|
| GET | `/` | Redirects to `/dashboard`. |
| GET | `/dashboard` | Public storefront. Spinner plus `Loading products…` until the catalog request finishes. |
| GET | `/login` | Centered login card. Spinner plus `Loading…` until the session check finishes. An active session redirects to `/products`. |
| GET | `/products` | Admin product page in the sidebar shell. Requires the admin cookie. Spinner plus `Loading products…` until the list loads. |
| GET | `/brands` | Admin brand page in the sidebar shell. Requires the admin cookie. Spinner plus `Loading brands…` until the list loads. |
| GET | `/categories` | Admin category page in the sidebar shell. Requires the admin cookie. Spinner plus `Loading categories…` until the list loads. |
| POST | `/api/auth/login` | `{ "username", "password" }`, `{ "email", "password" }`, or `{ "account", "password" }`. Returns `{ "user" }` and sets the admin cookie. |
| GET | `/api/auth/session` | Returns `{ "authenticated": true, "user" }` or `{ "authenticated": false }`. |
| POST | `/api/auth/logout` | Clears the admin cookie and returns `{ "ok": true }`. |
| GET | `/api/products` | Lists products. |
| POST | `/api/products` | `{ "name", "sku", "price", "brandId", "categoryId", "description", "imageUrl", "quantity" }` with optional `published` and optional `imageFile`. |
| PUT | `/api/products/<id>` | Same fields as create, including `brandId`, optional `published`, and optional `imageFile`. |
| GET | `/api/products/<id>/image` | Returns the uploaded image bytes. |
| DELETE | `/api/products/<id>` | Deletes that product. |
| GET | `/api/categories` | Lists categories. |
| POST | `/api/categories` | `{ "name", "description" }`. |
| PUT | `/api/categories/<id>` | Same fields as create. |
| DELETE | `/api/categories/<id>` | Deletes a category that has no products. |
| GET | `/api/brands` | Lists brands. |
| POST | `/api/brands` | `{ "name", "description" }`. |
| PUT | `/api/brands/<id>` | Same fields as create. |
| DELETE | `/api/brands/<id>` | Deletes a brand that has no products. |

Catalog `POST`, `PUT`, and `DELETE` require the admin cookie. Catalog `GET` stays public so the Dashboard can load without a session.
