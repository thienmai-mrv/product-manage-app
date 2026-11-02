# Workflow agent assignments

Each stage is a separate orchestration task. The agent is chosen when that task's worker starts:

`orca orchestration worker-start --task <task_id> --agent <id> --worktree current`

| Stage | Role definition | Agent | Agent id | Output |
|---|---|---|---|---|
| Requirement Analyst | `.orca/agents/01-requirement-analyst.md` | Antigravity | `antigravity` | `docs/workflow/requirements-analysis.md` |
| Solution Architect | `.orca/agents/02-solution-architect.md` | Cursor | `cursor` | `docs/workflow/implementation-plan.md` |
| Software Developer | `.orca/agents/03-software-developer.md` | Cursor | `cursor` | Source, tests, and `docs/workflow/development-report.md` |
| QA Engineer | `.orca/agents/04-qa-engineer.md` | Antigravity | `antigravity` | `docs/workflow/test-report.md` |
| PR Reviewer | `.orca/agents/05-pr-reviewer.md` | Antigravity | `antigravity` | Pull request URL and review summary |

A QA failure reuses the Software Developer assignment (`cursor`) for the fix, then runs QA again on `antigravity`.

## Approval gates

| Gate | After | Blocks | Options |
|---|---|---|---|
| Requirements | Requirement Analyst | Solution Architect | `approve`, `revise`, `abort` |
| Technical plan | Solution Architect | Software Developer | `approve`, `revise`, `abort` |
| Release | QA **PASS** | PR Reviewer push and pull-request creation | `approve-pr`, `hold`, `abort` |

The PR Reviewer pushes and creates a pull request only when the release gate is `approve-pr`. The pull request is never merged automatically.
