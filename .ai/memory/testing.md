# Testing

**Last updated:** 2026-11-02

## Commands

| Command | What it covers |
|---|---|
| `npm test` | `node --test web/src/catalogView.test.js` only. |
| `npm run memory:verify -- memory-init` | Memory baseline files, no `UNINITIALIZED` scaffolds, init report, lifecycle `pending-approval` or `approved`. |
| `npm run workflow:verify -- <change> <stage>` | Feature-stage artifacts. Also requires approved memory. |

## Test locations

| Area | Path | Style |
|---|---|---|
| Dashboard sort, price buckets, chips, featured split, non-excluding stock and color | `web/src/catalogView.test.js` | `node:test`, 14 `test()` cases, no DOM. |
| Store, Express, Worker, React pages | none | Not covered by `npm test`. |

The catalog tests assert screenshot option order, half-open price bounds, seed prices below $100, OR of price ranges, price counts ignoring other filters, in-stock and color keeping every product, newest and price sorts, fetched-order sorts, chip order, `viewCatalog` featured/cards split, `formatPrice`, and visibility of a negative price until a range is selected.

## Mandatory before Developer handoff

- `npm test` passes (`scripts/workflow-check.mjs` developer stage runs it).
- Tasks in the change `tasks.md` are checked.
- `reports/development-report.md` exists for that change.
- API changes stay aligned in Express routes and `src/worker.js`.

## Mandatory before QA PASS

- `openspec/changes/<change>/reports/test-report.md` exists.
- Field `Overall recommendation` is `PASS`.
- Workflow QA stage does not re-run `npm test` by itself. The developer stage does.

## Manual / exploratory checks

| Check | How |
|---|---|
| Local API and pages | Copy `.env.example` to `.env`, set `MONGODB_URI`, `npm run dev`, open `http://localhost:3000`. |
| Worker | Copy `.dev.vars.example` to `.dev.vars`, `npm run dev:worker`. |
| Empty database seed | First API call with both collections empty returns the three categories and three products. |
| Category delete guard | Delete is rejected while a product still uses the category. |
| Dashboard states | Loading copy `Loading products…`, error in `.message.error`, empty catalog `No products yet.`, zero matches `No products match the selected filters.` |

This init did not start the servers or connect to MongoDB.

## Gaps / known weak coverage

| Gap | Detail |
|---|---|
| No store tests | Validation messages, seed, duplicate category names, and delete guards are specified and implemented, but not executed by `npm test`. |
| No HTTP tests | Express vs Worker status gaps in [runtime-parity.md](runtime-parity.md) are untested. |
| No component tests | React routes, cart cap, confirm delete, and wishlist reset are untested. |
| Workflow script | `workflow-check.mjs` checks files and, for the developer stage, the `npm test` exit code. It does not lint. No ESLint script is defined. |
