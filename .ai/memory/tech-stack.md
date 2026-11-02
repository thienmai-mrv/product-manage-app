# Tech Stack

**Last updated:** 2026-11-02

## Runtime

| Item | Value |
|---|---|
| Node | `>=22` in `package.json` `engines`. `.nvmrc` is `22`. |
| Module system | ESM. Root `package.json` has `"type": "module"`. Exception: `src/empty-encryption.cjs` is CommonJS (`module.exports = {}`). |
| Package manager | npm. Root `package-lock.json`. npm workspaces include `web`. |

## Backend

| Concern | Choice | Path |
|---|---|---|
| HTTP server | Express `^4.21.2` | `src/app.js`, `server.js` |
| Worker | Wrangler `^4.86.0`, `compatibility_date` `2026-03-01`, `nodejs_compat` | `wrangler.toml`, `src/worker.js` |
| Mongo driver | `mongodb` `^6.18.0` | `src/store.js` |
| Encryption addon stub | Alias `mongodb-client-encryption` to an empty CJS module because Workers cannot load the native addon | `wrangler.toml` `[alias]`, `src/empty-encryption.cjs` |

## Frontend

| Concern | Choice | Path |
|---|---|---|
| UI | React `^19.1.1`, React DOM | `web/package.json`, `web/src/**` |
| Routing | `react-router-dom` `^7.18.4` (`BrowserRouter`) | `web/src/main.jsx`, `web/src/App.jsx` |
| Build | Vite `^7.1.5`, `@vitejs/plugin-react` `^5.0.2` | `web/vite.config.js` |
| Styles | Plain CSS, no CSS framework | `web/src/index.css` |

## Data

| Concern | Choice | Path |
|---|---|---|
| Database | MongoDB. Name from `MONGODB_DB`, default `productmanage` | `src/store.js`, `wrangler.toml` `[vars]` |
| Connection | `MONGODB_URI` from the environment. One client per operation. | `src/store.js`, `src/env.js` |
| Local Express env file | `.env` copied from `.env.example` | `src/env.js` |
| Local Worker env file | `.dev.vars` copied from `.dev.vars.example` | Wrangler convention; not read by `src/env.js` |

## Deploy

| Target | Tool | Notes |
|---|---|---|
| Local dev | `npm run dev` | `node server.js --dev` with Vite middleware. |
| Local production-like | `npm start` | Builds `web/` then `node server.js` serving `web/dist`. |
| Worker local | `npm run dev:worker` | `scripts/with-node.cmd` then `wrangler dev`. |
| Preview / deploy | `npm run preview`, `npm run deploy` | Build web, then Wrangler. Worker name `product-manage-app`. |
| Worker build hook | `[build] command = "node scripts/build-web.mjs"` | Installs root deps if Vite is missing, then `npm run build --prefix web`. |

## Test tooling

| Layer | Tool | Command |
|---|---|---|
| Dashboard view model | `node:test` | `npm test` runs `node --test web/src/catalogView.test.js` |
| Workflow gates | `scripts/workflow-check.mjs` | `npm run workflow:verify`, `workflow:ready`, `memory:verify`, `memory:ready` |

No React Testing Library, Playwright, or store/API test runner is configured.

## Do not introduce without a decision record

- A third runtime or a split store implementation per runtime.
- A new database, ORM, or a return to `data/db.json`.
- An auth library or session mechanism.
- Replacing npm workspaces, Vite, or the Node 22 ESM baseline.
- Writing secrets into `wrangler.toml`.
