# Feature Delivery Workflow

Coordinator runbook for Orca Desktop + OpenSpec + Cursor CLI. Assignments and gates: [agent-assignments.md](agent-assignments.md). Project Memory: [../../.ai/memory/README.md](../../.ai/memory/README.md).

## Layers

| Layer | Tool | Responsibility |
|---|---|---|
| Orchestration | Orca Desktop | Worktrees, supervised workers, decision gates |
| Specification | OpenSpec | Per-feature proposal, specs, design, tasks, reports |
| Project Memory | `.ai/memory/` | Shared baseline knowledge for every agent |
| Execution | Cursor CLI (+ assigned agents) | Runs each stage worker |

OpenSpec does not orchestrate agents. Memory does not replace OpenSpec. Orca runs agents and holds gates. `scripts/workflow-check.mjs` blocks stages until outputs and approvals exist.

## Sequence

```mermaid
flowchart LR
  M0[0 Memory Init] --> GM0{GM0}
  GM0 -->|approve| K[Kickoff feature worktree]
  K --> A1[1 Analyst]
  A1 --> G1{G1}
  G1 -->|approve| A2[2 Architect]
  A2 --> G2{G2}
  G2 -->|approve| A3[3 Developer]
  A3 --> G3{G3}
  G3 -->|approve| A4[4 QA]
  A4 --> G4{G4}
  G4 -->|approve| A5[5 Reviewer]
  A5 --> A6[6 Memory Update]
  A6 --> GM5{GM5}
  GM5 -->|approve| M[Human merges PR]
```

Memory Init (A0) runs **once** (or when baseline is rejected). A6 runs **after every feature** so the next feature inherits updated knowledge.

## Project Memory layout

```text
.ai/memory/
  README.md STATUS.md INDEX.md approvals.md
  project-overview.md architecture.md domain-model.md
  tech-stack.md conventions.md runtime-parity.md
  security.md testing.md glossary.md known-issues.md
  _templates/   modules/   apis/   decisions/   changelog/   reports/
```

## Runbook

### 0. Bootstrap Project Memory (once)

On a branch that can update `.ai/memory/` (for example `feature/memory-bootstrap` or `main` after review):

```bash
npm run memory:ready -- memory-init
orca orchestration run-create --objective "Initialize Project Memory" --json
orca orchestration task-create --task-title "memory-init" --spec "<A0 task spec>" --json
orca orchestration worker-start --task <task_id> --worktree current --agent cursor --json
```

After the worker finishes:

```bash
npm run memory:verify -- memory-init
```

Open gate **GM0**. On `approve`, append a row to `.ai/memory/approvals.md` and set `STATUS.md`:

```text
**Lifecycle:** approved
```

Commit the memory baseline before starting features.

### 1. Feature kickoff

```bash
orca worktree create --name <change> --branch feature/<change> --base-branch main --no-parent --json
```

In that worktree:

```bash
npm install
openspec new change <change>
cp .orca/templates/approvals.md openspec/changes/<change>/approvals.md
npm run workflow:ready -- <change> analyst
orca orchestration run-create --objective "Feature <change>" --json
```

`workflow:ready` fails if Project Memory is not approved.

### 2. Run each stage

Stages in order: `analyst` → `architect` → `developer` → `qa` → `reviewer` → `memory-update`.

For each stage:

1. `orca orchestration task-create` with the task spec template below.
2. For stages after `analyst`, create the previous gate on this task, wait for human resolution, record it in the correct approvals file, checkpoint-commit.
3. `npm run workflow:ready -- <change> <stage>`
4. `orca orchestration worker-start --task <task_id> --worktree path:<worktree-path> --agent <id> --json`
5. Wait with `orca orchestration check --wait ...`, reply to questions, then `worker-release`.
6. `npm run workflow:verify -- <change> <stage>`

Agent ids: see [agent-assignments.md](agent-assignments.md).

### 3. After Reviewer

1. Run **memory-update** on the same feature branch.
2. Open **GM5**. On approve, update `.ai/memory/approvals.md` and set `STATUS.md` lifecycle to `approved`.
3. Ensure memory commits are on the PR branch.
4. Human merges the pull request.

## Task spec templates

### Memory init (A0)

```text
Target: repository Project Memory under .ai/memory/.
Role: read and follow .orca/agents/00-memory-initializer.md exactly.
Change: Initialize Project Memory from current source and OpenSpec main specs.
Constraints: edit only .ai/memory/** except approvals.md; no application code changes; no secrets.
Acceptance: npm run memory:verify -- memory-init passes. Stop for GM0.
```

### Feature stage (A1–A5)

```text
Target: OpenSpec change <change> on branch feature/<change>.
Role: read and follow .orca/agents/<NN-role>.md exactly.
Shared context: read .ai/memory/INDEX.md and linked files first. Do not edit memory.
Change: <feature request or revise/fix notes>.
Constraints: openspec/config.yaml; edit only files your role owns.
Acceptance: npm run workflow:verify -- <change> <stage> passes. Then stop.
```

### Memory update (A6)

```text
Target: .ai/memory/ for change <change> on feature/<change>.
Role: read and follow .orca/agents/06-memory-updater.md exactly.
Change: Update Project Memory from the reviewed feature artifacts and diff.
Constraints: edit only .ai/memory/** except approvals.md; do not change application code or OpenSpec artifacts unless needed to push memory commits.
Acceptance: npm run workflow:verify -- <change> memory-update passes. Stop for GM5.
```

## Validation commands

| Command | Purpose |
|---|---|
| `npm run memory:ready -- memory-init` | Templates/approvals present before A0 |
| `npm run memory:verify -- memory-init` | Baseline complete before GM0 |
| `npm run workflow:ready -- <change> <stage>` | Prior stages + gates + approved memory |
| `npm run workflow:verify -- <change> <stage>` | Current stage outputs |

## Rules

- One feature → one change → one branch → one worktree. Stages are sequential.
- A1–A5 read memory; only A0/A6 write memory.
- Humans own all gates and both approvals logs.
- Nothing merges before G4, Reviewer APPROVED, memory-update done, and GM5 approved.
