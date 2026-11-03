# Memory Index

Last refreshed: 2026-11-03

## Core (required)

| File | Purpose | Status |
|---|---|---|
| [STATUS.md](STATUS.md) | Approval lifecycle | approved, version 1 |
| [approvals.md](approvals.md) | GM0 / GM5 log | GM0 approved 2026-11-03 |
| [project-overview.md](project-overview.md) | What the product is | current |
| [architecture.md](architecture.md) | System structure and data flow | current |
| [domain-model.md](domain-model.md) | Entities and business rules | current |
| [tech-stack.md](tech-stack.md) | Languages, frameworks, tooling | current |
| [conventions.md](conventions.md) | Coding and repo conventions | current |
| [runtime-parity.md](runtime-parity.md) | Express vs Cloudflare Worker rules | current |
| [security.md](security.md) | Secrets, validation, trust boundaries | current |
| [testing.md](testing.md) | How to test and what “done” means | current |
| [glossary.md](glossary.md) | Shared terms | current |
| [known-issues.md](known-issues.md) | Known limitations and debt | current |

## Catalogs (created as needed)

| Directory | Purpose |
|---|---|
| [modules/](modules/) | [products](modules/products.md), [categories](modules/categories.md), [dashboard](modules/dashboard.md), [store](modules/store.md) |
| [apis/](apis/) | [products](apis/products.md), [categories](apis/categories.md), [pages](apis/pages.md) |
| [decisions/](decisions/) | [001 dual runtime](decisions/001-dual-express-worker-runtime.md), [002 per-request Mongo client](decisions/002-per-request-mongo-client.md), [003 URI outside source](decisions/003-mongodb-uri-outside-source.md) |
| [changelog/](changelog/) | Empty until the first memory update |
| [reports/](reports/) | [init-report.md](reports/init-report.md) |

## Templates

Copy from [_templates/](_templates/) when creating a new module, API, decision, or changelog entry. Templates were not modified by memory init.

## Reading order for feature agents

1. `STATUS.md` (must be `approved`)
2. `project-overview.md`
3. `architecture.md` and `runtime-parity.md`
4. `domain-model.md`
5. Module and API files named by the feature
6. `conventions.md`, `security.md`, `testing.md`
7. Relevant `decisions/` and `known-issues.md`
