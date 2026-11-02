# Memory Index

Last refreshed: UNINITIALIZED

## Core (required)

| File | Purpose | Status |
|---|---|---|
| [STATUS.md](STATUS.md) | Approval lifecycle | present |
| [approvals.md](approvals.md) | GM0 / GM5 log | present |
| [project-overview.md](project-overview.md) | What the product is | scaffold |
| [architecture.md](architecture.md) | System structure and data flow | scaffold |
| [domain-model.md](domain-model.md) | Entities and business rules | scaffold |
| [tech-stack.md](tech-stack.md) | Languages, frameworks, tooling | scaffold |
| [conventions.md](conventions.md) | Coding and repo conventions | scaffold |
| [runtime-parity.md](runtime-parity.md) | Express vs Cloudflare Worker rules | scaffold |
| [security.md](security.md) | Secrets, validation, trust boundaries | scaffold |
| [testing.md](testing.md) | How to test and what “done” means | scaffold |
| [glossary.md](glossary.md) | Shared terms | scaffold |
| [known-issues.md](known-issues.md) | Known limitations and debt | scaffold |

## Catalogs (created as needed)

| Directory | Purpose |
|---|---|
| [modules/](modules/) | Per-module memory (`products`, `categories`, `dashboard`, …) |
| [apis/](apis/) | Per-route or per-resource API memory |
| [decisions/](decisions/) | Architecture Decision Records |
| [changelog/](changelog/) | One entry per feature that updated memory |
| [reports/](reports/) | Init and update agent reports |

## Templates

Copy from [_templates/](_templates/) when creating a new module, API, decision, or changelog entry.

## Reading order for feature agents

1. `STATUS.md` (must be `approved`)
2. `project-overview.md`
3. `architecture.md` and `runtime-parity.md`
4. `domain-model.md`
5. Module and API files named by the feature
6. `conventions.md`, `security.md`, `testing.md`
7. Relevant `decisions/` and `known-issues.md`
