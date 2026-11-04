# Testing

**Last updated:** 2026-11-04

## Commands

| Command | What it covers |
|---|---|
| `npm test` | `node --test` on `web/src/catalogView.test.js`, `src/productInput.test.js`, `web/src/productImage.test.js`, and `src/qa-scenarios.test.js`. Does not include `src/brand-qa.test.js`. |
| `npm run memory:verify -- memory-init` | Memory baseline files, no `UNINITIALIZED` scaffolds, init report, lifecycle `pending-approval` or `approved`. |
| `npm run workflow:verify -- <change> <stage>` | Feature-stage artifacts. The shared baseline check also requires memory lifecycle `approved` before the stage checks run. |

## Test locations

| Area | Path | Style |
|---|---|---|
| Dashboard sort, price buckets, chips, featured split, publish filter, in-stock predicate, brand OR filter | `web/src/catalogView.test.js` | `node:test`, no DOM. Brand cases cover empty `brandIds`, OR of selected brands, AND with category, price counts ignoring brands, chip order with brand names before categories, and an unpublished product staying out when its brand is selected. |
| Product input and image helpers | `src/productInput.test.js`, `web/src/productImage.test.js` | `node:test`. Present on `main` before this change. |
| Store, Express, and Worker scenarios, including one brand CRUD path | `src/qa-scenarios.test.js` | `node:test` with an in-memory Mongo harness. Included in `npm test`. |
| Longer brand UI and Express/Worker parity scenarios | `src/brand-qa.test.js` | `node:test` with an in-memory Mongo harness. Not included in `npm test`. |

The catalog tests also assert screenshot option order, half-open price bounds, seed prices below $100, OR of price ranges, price counts ignoring other filters, newest and price sorts, fetched-order sorts, `viewCatalog` featured/cards split, `formatPrice`, and visibility of a negative price until a range is selected.

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
| Empty database seed | First API call with an empty `brands` collection inserts the ten sample brands. Categories and products are inserted only when both of those collections are empty, and the three starter products reference Samsung, Sony, and Panasonic. |
| Brand delete guard | Delete is rejected while a product still uses the brand. |
| Category delete guard | Delete is rejected while a product still uses the category. |
| Dashboard states | Loading copy `Loading products…`, error in `.message.error`, empty catalog `No products yet.`, zero matches `No products match the selected filters.` |

This init did not start the servers or connect to MongoDB.

## Gaps / known weak coverage

| Gap | Detail |
|---|---|
| Brand suite outside `npm test` | `src/brand-qa.test.js` is not part of the `npm test` script. Workflow developer verification does not run it. |
| Partial HTTP coverage | `src/qa-scenarios.test.js` exercises some Express and Worker paths with an in-memory harness. The Express vs Worker 405 gap in [runtime-parity.md](runtime-parity.md) remains KI-002. |
| No browser component tests | React routes, cart cap, confirm delete, and wishlist reset have no browser runner. `brand-qa.test.js` renders some pages to static markup. |
| Workflow script | `workflow-check.mjs` checks files and, for the developer stage, the `npm test` exit code. It does not lint. No ESLint script is defined. |
