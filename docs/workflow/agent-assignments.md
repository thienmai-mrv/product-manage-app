# Workflow Agent Assignments

Each stage is a separate Orca orchestration task. Start workers with the agent id below:

```bash
orca orchestration worker-start --task <task_id> --worktree path:<worktree-path> --agent <id> --json
```

## Agents

| # | Agent | Stage id | Role definition | Agent id | Responsibility | Main output |
|---|---|---|---|---|---|---|
| A0 | Memory Initialization | `memory-init` | `.orca/agents/00-memory-initializer.md` | `cursor` | Analyze repo; create Project Memory baseline | `.ai/memory/**`, `reports/init-report.md` |
| A1 | Requirement Analyst (BA) | `analyst` | `.orca/agents/01-requirement-analyst.md` | `antigravity` | Analyze business requirements | `proposal.md`, `specs/**/spec.md` |
| A2 | Solution Architect | `architect` | `.orca/agents/02-solution-architect.md` | `cursor` | Technical architecture | `design.md`, `tasks.md` |
| A3 | Software Developer | `developer` | `.orca/agents/03-software-developer.md` | `cursor` | Implement functionality | Source, tests, `reports/development-report.md` |
| A4 | QA Engineer | `qa` | `.orca/agents/04-qa-engineer.md` | `antigravity` | Test implementation and verify changed page layout locally | `reports/test-report.md` |
| A5 | PR Reviewer | `reviewer` | `.orca/agents/05-pr-reviewer.md` | `antigravity` | Review, archive, open PR | `reports/review-report.md`, PR URL |
| A6 | Memory Update | `memory-update` | `.orca/agents/06-memory-updater.md` | `cursor` | Update Project Memory after the feature | `.ai/memory/**`, `changelog/<change>.md` |

Feature artifact paths are relative to `openspec/changes/<change>/` unless noted.

## Shared context

Before A1–A5 start, Project Memory must be approved (`STATUS.md` lifecycle `approved`, GM0 approved). Every feature agent reads `.ai/memory/` first and must not rewrite it. Only A0 and A6 write memory.

## Artifact ownership

| Artifact | A0 | A1 | A2 | A3 | A4 | A5 | A6 | Human |
|---|---|---|---|---|---|---|---|---|
| `.ai/memory/**` (except approvals) | write | read | read | read | read | read | write | approve GM0/GM5 |
| `.ai/memory/approvals.md` | read | | | | | | read | write |
| `proposal.md`, `specs/**` | | write | read | read | read | read | read | G1 |
| `design.md` | | | write | read | read | read | read | G2 |
| `tasks.md` | | | write | check boxes | read | read | read | G2 |
| Source / unit tests | | | | write | add tests only | read | | G3 |
| `reports/development-report.md` | | | | write | read | read | read | |
| `reports/test-report.md` | | | | read | write | read | read | G4 |
| `reports/review-report.md` | | | | read | | write | read | |
| Feature `approvals.md` | | read | read | read | read | read | read | write |
| Archive, push, PR | | | | | | write | push memory commits | merge |

## Approval gates

| Gate | After | Blocks | Question | Options |
|---|---|---|---|---|
| GM0 Memory baseline | A0 | A1 and all features | Is Project Memory accurate enough to be the shared baseline? | `approve`, `revise`, `abort` |
| G1 Requirements | A1 | A2 | Are proposal and specs complete and testable? | `approve`, `revise`, `abort` |
| G2 Technical plan | A2 | A3 | Can design and tasks be implemented as written? | `approve`, `revise`, `revise-requirements`, `abort` |
| G3 Implementation | A3 | A4 | Does the change match the plan with passing unit tests? | `approve`, `revise`, `abort` |
| G4 Release | A4 | A5 | Did QA pass; may Reviewer push/open PR? | `approve`, `fix`, `abort` |
| GM5 Memory update | A6 | Merge | Does the memory diff correctly reflect this feature? | `approve`, `revise`, `abort` |
| Merge | A5+A6 | `main` | Human review of the pull request | merge or request changes |

After GM0 or GM5 is `approved`, the coordinator sets `.ai/memory/STATUS.md` **Lifecycle** to `approved` and clears **Pending files**.

## Loops

| Trigger | Next step |
|---|---|
| `revise` at GM0 | Re-run A0 with notes in `.ai/memory/approvals.md` |
| `revise` at G1–G3 | Re-run the same feature stage |
| `revise-requirements` at G2 | A1 → G1 → A2 → G2 |
| QA `FAIL` | `fix` at G4 → A3 → G3 → A4 → G4 |
| Reviewer `CHANGES_REQUESTED` | A3 → G3 → A4 → G4 → A5 |
| `revise` at GM5 | Re-run A6 with notes |
| `abort` | Stop; keep worktree for reference or delete |

## Automatic validation

| Command | When |
|---|---|
| `npm run memory:ready -- memory-init` | Before starting A0 |
| `npm run memory:verify -- memory-init` | After A0, before GM0 |
| `npm run workflow:ready -- <change> <stage>` | Before A1–A6 (requires approved memory) |
| `npm run workflow:verify -- <change> <stage>` | After each feature/memory-update stage |

| Stage | `verify` checks |
|---|---|
| `memory-init` | Core memory files exist, no `UNINITIALIZED` banners, init report present, STATUS pending-approval or approved |
| `analyst` | proposal + specs; `openspec validate --strict` |
| `architect` | design + checkbox tasks; strict validate |
| `developer` | all tasks checked; development report; `npm test` |
| `qa` | test report **Overall recommendation:** `PASS` |
| `reviewer` | **Decision:** `APPROVED`, PR URL, archived change, specs validate |
| `memory-update` | `changelog/<change>.md` + `reports/update-<change>.md`; STATUS pending-approval or approved |
