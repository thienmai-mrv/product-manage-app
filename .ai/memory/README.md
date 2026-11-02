# Project Memory System

`.ai/memory/` is the shared project knowledge base for every Orca agent (Cursor CLI and others). Agents read it at the start of a feature so they do not re-discover architecture, domain rules, or conventions from scratch.

OpenSpec remains the source of truth for **what a feature must do**. Memory is the source of truth for **how this project works today**.

## Layers

| Layer | Owns | Does not own |
|---|---|---|
| OpenSpec (`openspec/`) | Feature requirements, specs, design, tasks | Long-lived project knowledge |
| Project Memory (`.ai/memory/`) | Architecture, modules, APIs, conventions, decisions | Feature acceptance criteria |
| Orca agents | Read memory; Init/Update agents write it | Approving memory (humans only) |

## Lifecycle

1. **Initialize once** with the Memory Initialization Agent (`.orca/agents/00-memory-initializer.md`). Human approves at gate **GM0**.
2. **Every feature** starts only when `STATUS.md` shows `approved`. Agents A1–A5 read memory as shared context.
3. **After the feature** is reviewed, the Memory Update Agent (`.orca/agents/06-memory-updater.md`) patches memory. Human approves at gate **GM5**.
4. Memory updates land on the feature branch (same PR) before merge.

## Rules

- Facts only. Prefer “observed in code” over guesses. Mark uncertainty with `UNCONFIRMED:`.
- No secrets. Never write `MONGODB_URI` values, tokens, or `.env` contents.
- One writer at a time: only the Init or Update agent may edit memory files. A1–A5 are read-only consumers.
- Keep files short. Link to `openspec/specs/` and source paths instead of copying large specs.
- Update `INDEX.md` and `STATUS.md` whenever files are added or lifecycle changes.

## Commands

```bash
npm run memory:verify -- memory-init
npm run memory:verify -- memory-update
npm run memory:ready -- analyst
```

`workflow:ready` for feature stages also requires an approved memory status.

## Start here

1. Read [INDEX.md](INDEX.md) for the map of files.
2. Read [STATUS.md](STATUS.md) for approval state.
3. Follow [docs/workflow/README.md](../../docs/workflow/README.md) for the full coordinator runbook.
