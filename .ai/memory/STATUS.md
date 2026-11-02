# Memory Status

**Lifecycle:** uninitialized
**Version:** 0
**Last agent:** none
**Last change:** none
**Pending files:** all core files
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
