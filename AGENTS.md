# Software Development Workflow

Every feature goes through specialized agents in sequence, with human approval gates. All agents share **Project Memory** under `.ai/memory/` so they do not re-analyze the whole codebase from scratch.

- **Orchestration:** Orca Desktop runs agents, worktrees, and gates.
- **Specification:** OpenSpec is the source of truth for each feature change.
- **Project Memory:** `.ai/memory/` is the source of truth for how the project works today.
- **Execution:** Cursor CLI (and assigned agents in [docs/workflow/agent-assignments.md](docs/workflow/agent-assignments.md)).

Coordinator runbook: [docs/workflow/README.md](docs/workflow/README.md).  
Memory system: [.ai/memory/README.md](.ai/memory/README.md).

## Workflow order

### One-time bootstrap

0. Memory Initialization Agent → **GM0** human approval → `STATUS.md` = `approved`

### Every feature

1. Requirement Analyst: `proposal.md` and `specs/**`
2. **G1 Requirements**
3. Solution Architect: `design.md` and `tasks.md`
4. **G2 Technical plan**
5. Software Developer: source, unit tests, `reports/development-report.md`
6. **G3 Implementation**
7. QA Engineer: `reports/test-report.md`
8. **G4 Release**
9. PR Reviewer: `reports/review-report.md`, archive, pull request
10. Memory Update Agent: patch `.ai/memory/**`, changelog, update report
11. **GM5 Memory update** approval
12. Human merges the pull request

## Shared rules

- Read `.ai/memory/INDEX.md` before exploring the repo. Treat approved memory as shared baseline context.
- Read your role in `.orca/agents/` and do only that role.
- Write only artifacts your role owns. Do not edit another agent's files or memory unless you are the Memory Init/Update agent.
- Work on `feature/<change>`. Never commit to `main` from a feature agent.
- Follow `openspec/config.yaml` (Express/Worker parity, Node 22 ESM, `npm test`, no secrets in source).
- Do not claim completion until the stage verification command passes.
- Never commit credentials (`MONGODB_URI`, `.env`, `.dev.vars`).

## Approval gates

| Gate | After | Blocks |
|---|---|---|
| GM0 | Memory init | All feature stages |
| G1–G4 | A1–A4 | Next feature agent |
| GM5 | Memory update | Merge |

Only a human writes `.ai/memory/approvals.md` and feature `approvals.md`. After GM0/GM5 `approved`, the coordinator sets `.ai/memory/STATUS.md` lifecycle to `approved`.

## Failure loops

- QA `FAIL` → `fix` at G4 → Developer → G3 → QA → G4
- Reviewer `CHANGES_REQUESTED` → Developer → G3 → QA → G4 → Reviewer
- Memory rejected at GM0/GM5 → re-run Init/Update with notes from `.ai/memory/approvals.md`
