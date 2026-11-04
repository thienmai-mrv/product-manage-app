# Memory changelog: add-brand-manage

**Date:** 2026-11-04
**Agent:** memory-update
**PR:** https://github.com/thienmai-mrv/product-manage-app/pull/2

## Why memory changed

The reviewed change adds a `brands` collection and `/api/brands`, the `/brands` admin page, menu order `Dashboard | Products | Brands | Categories`, required `brandId` on product create and update, a Brand column and selector on `/products`, a dashboard Brands filter before Categories, and ten sample brands inserted whenever the `brands` collection is empty. Approved memory still described a two-collection catalog and a dashboard that did not load brands.

## Files touched

| File | Action | Summary |
|---|---|---|
| `STATUS.md` | updated | Version 2. Lifecycle `pending-approval`. Last change `add-brand-manage`. |
| `INDEX.md` | updated | Brands module and API, changelog, update report, refresh date. |
| `project-overview.md` | updated | Brand admin surface, seed, nav order, brand-management spec. |
| `architecture.md` | updated | Brand route, collection, page, and seed/index flow. |
| `domain-model.md` | updated | Brand entity, product `brandId` / `brandName`, seed and filter rules. |
| `glossary.md` | updated | Brand and sample-seed terms. |
| `conventions.md` | updated | `/api/brands`, brand error strings, nav includes `/brands`. |
| `runtime-parity.md` | updated | Brand handlers and `/brands` in Express `pagePaths`. |
| `security.md` | updated | Brand name, description, and `brandId` validated in the store. Brand admin stays unauthenticated. |
| `testing.md` | updated | Brand cases in `catalogView.test.js` and `src/qa-scenarios.test.js`. `src/brand-qa.test.js` is outside `npm test`. |
| `known-issues.md` | updated | KI-002 page list includes `/brands`. KI-004 includes the empty-brands seed. KI-001 notes the extra test file. KI-007 text corrected to current stock behavior; not retired. |
| `modules/brands.md` | created | Brand module. |
| `modules/products.md` | updated | Brand column, selector, and required `brandId`. |
| `modules/dashboard.md` | updated | Parallel brand fetch, Brands filter, chip order. |
| `modules/store.md` | updated | Brand CRUD, `brand_name_ci`, `ensureBrandSeed`. |
| `apis/brands.md` | created | `/api/brands` contract. |
| `apis/products.md` | updated | `brandId` and `brandName` on the product contract. |
| `apis/pages.md` | updated | `/brands` page and four Express page paths. |
| `reports/update-add-brand-manage.md` | created | This update's report. |

## New modules / APIs / decisions

- Module: `modules/brands.md`
- API: `apis/brands.md`
- No new decision file. Brand CRUD follows the category module and the existing dual-runtime and per-request client decisions.

## Explicit non-changes

- `approvals.md` was not edited. GM5 is still open.
- Application source and OpenSpec artifacts were not edited.
- KI-002, KI-003, KI-004, and KI-005 stay open. The design left Express 405, the seed race, and `indexesReady` as they were.
- Dashboard cards and the featured tile still show `categoryName` only. `brandName` is not printed on the card.
- Existing product documents without `brandId` are not rewritten. Reads return `""`. A stock or publish toggle on such a row gets HTTP 400 `"Brand is required"`.
- `published`, `inStock`, and product image upload were already on `main`. This update records `brandId` beside them in the product entity and does not re-document the image byte pipeline.
- Color swatches and weight sorts remain in `openspec/specs/product-dashboard/spec.md` and are absent from `web/src/catalogView.js` and `web/src/components/FilterPanel.jsx` on `main` and on this branch. That gap was not introduced or closed here.
