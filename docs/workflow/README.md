# Workflow Artifacts

The agents create the following files during a feature workflow:

| File | Created by | Purpose |
|---|---|---|
| `requirements-analysis.md` | Requirement Analyst | Requirements and acceptance criteria |
| `implementation-plan.md` | Solution Architect | Technical design and implementation plan |
| `development-report.md` | Software Developer | Implementation summary and test details |
| `test-report.md` | QA Engineer | Test evidence, defects, and PASS/FAIL result |

These are generated during execution; they are intentionally not pre-created as empty documents.

The coordinator should obtain human approval of the implementation plan before development, and human release approval before the PR Reviewer pushes or creates a pull request.
