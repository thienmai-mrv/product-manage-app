# product-manage-app

Sample product catalog with a React frontend and an Express backend. Express serves the JSON API and the Dashboard, Product, and Category pages. The same API runs on a Cloudflare Worker for deployment. The admin page layout follows the json-config-server admin UI.

Products and categories are stored in MongoDB. `MONGODB_URI` is an environment secret and is never written into `wrangler.toml`.

## Local

Copy `.env.example` to `.env` and set `MONGODB_URI` to your Atlas connection string. `MONGODB_DB` defaults to `productmanage`.

```bash
npm install
npm run dev
```

Open http://localhost:3000. `/` redirects to `/dashboard`. The first API call creates the sample categories and products when both collections are empty.

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
| GET | `/dashboard` | React dashboard page. |
| GET | `/products` | React product page. |
| GET | `/categories` | React category page. |
| GET | `/api/products` | Lists products. |
| POST | `/api/products` | `{ "name", "sku", "price", "categoryId", "description", "imageUrl", "quantity" }` with optional `published` and optional `imageFile`. |
| PUT | `/api/products/<id>` | Same fields as create, including optional `published` and optional `imageFile`. |
| GET | `/api/products/<id>/image` | Returns the uploaded image bytes. |
| DELETE | `/api/products/<id>` | Deletes that product. |
| GET | `/api/categories` | Lists categories. |
| POST | `/api/categories` | `{ "name", "description" }`. |
| PUT | `/api/categories/<id>` | Same fields as create. |
| DELETE | `/api/categories/<id>` | Deletes a category that has no products. |
