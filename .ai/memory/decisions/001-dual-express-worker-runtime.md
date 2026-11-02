# ADR-001: Dual Express and Cloudflare Worker runtime

**Date:** 2026-11-02
**Status:** accepted
**Change:** none (baseline observed in the repo)

## Context

The catalog must run on a local Node server and deploy to Cloudflare Workers. `openspec/config.yaml` requires every route and API change to behave the same in both.

## Decision

Keep one store module (`src/store.js`) and two HTTP adapters:

- Express: `server.js`, `src/app.js`, `src/routes/products.js`, `src/routes/categories.js`
- Worker: `src/worker.js`, with static files from the `ASSETS` binding

Business rules stay in the store. Adapters only map methods, status codes, and JSON envelopes.

## Alternatives considered

| Alternative | Why it was not used |
|---|---|
| Express only | `wrangler.toml` and `src/worker.js` show deployment is a Worker. |
| Worker only | `npm run dev` and `server.js` are the local path, including Vite middleware. |
| Separate store copies | Would make validation drift. The current code uses one module. |

## Consequences

- HTTP tables are duplicated and can drift. See [../runtime-parity.md](../runtime-parity.md) and KI-002.
- Worker constraints apply to the shared store: no long-lived Mongo client, no native encryption addon.
- The React app is built once and hosted by either Express or Worker assets.

## Follow-ups

- Add an automated parity check if API coverage grows beyond code review.
