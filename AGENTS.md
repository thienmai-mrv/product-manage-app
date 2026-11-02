# Software Development Workflow

This repository uses a five-role, sequential software-development workflow coordinated through Orca Desktop.

## Workflow order

1. Requirement Analyst
2. Solution Architect
3. Human approval of the technical plan
4. Software Developer
5. QA Engineer
6. Human release approval
7. PR Reviewer

## Shared rules

- Read the relevant role definition in `.orca/agents/` before executing a task.
- Work only on the task assigned to the current role.
- Do not skip a phase or start a dependent phase before its prerequisites are verified.
- Store workflow documents in `docs/workflow/`.
- Report blockers explicitly; do not silently make assumptions about ambiguous requirements.
- Do not claim completion without checking the required output.
- Keep changes scoped to the requested feature.
- Human approval gates are coordinator-controlled. A prompt asking for approval is not itself an enforced permission boundary.
- Protect credentials and secrets. Never add them to source control.

## Approval gates

### Gate 1: Technical plan

The coordinator must obtain explicit human approval of
`docs/workflow/implementation-plan.md` before dispatching the Developer.

### Gate 2: Release readiness

The coordinator must verify the final diff and
`docs/workflow/test-report.md`, then obtain explicit human approval
before dispatching the PR Reviewer to push or create a pull request.

## QA failure loop

If mandatory tests fail:

1. QA records reproducible failures in `docs/workflow/test-report.md`.
2. The coordinator dispatches a Developer fix task.
3. The coordinator dispatches QA again to verify the fixes.
4. Repeat until mandatory tests pass or the coordinator escalates the blocker.

## Expected workflow artifacts

- `docs/workflow/requirements-analysis.md`
- `docs/workflow/implementation-plan.md`
- `docs/workflow/development-report.md`
- `docs/workflow/test-report.md`
- Pull Request URL and review summary
