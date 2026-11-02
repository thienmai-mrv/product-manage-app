# Memory Status

**Lifecycle:** pending-approval
**Version:** 1
**Last agent:** memory-init
**Last change:** none
**Pending files:** none — core files, modules, APIs, and decisions are filled; GM0 has not been recorded
**Approved by:** none
**Approved at:** none

## Lifecycle values

| Value | Meaning |
|---|---|
| `uninitialized` | Templates/scaffolds only. Run Memory Initialization Agent. |
| `draft` | Agent wrote or updated memory. Not yet approved. |
| `pending-approval` | Agent finished. Waiting for GM0 or GM5. |
| `approved` | Human approved. Feature agents may start. |
| `rejected` | Human rejected. Re-run Init or Update with notes from `approvals.md`. |

Feature stages (`analyst` and later) must see `Lifecycle: approved`. After a Memory Update Agent run, lifecycle becomes `pending-approval` until GM5.

This baseline is waiting for a human GM0 decision in `approvals.md`. The init agent does not set `approved`.
