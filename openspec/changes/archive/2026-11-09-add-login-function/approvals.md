# Approvals: add-login-function

Only the human coordinator edits this file. Agents read it and never write to it.

Append one row per decision. When a gate is decided more than once, the last row for that gate is the one that counts. `npm run workflow:ready` accepts only `approved`.

| Gate | After stage | Decision | Approved by | Date | Notes |
|---|---|---|---|---|---|
| G1 | analyst | approved | Thien Mai | 2026-11-09 | Requirements approved. Seven open questions in proposal.md stay unresolved for the architect to decide in the technical plan. |
| G2 | architect | approved | Thien Mai | 2026-11-09 | Technical plan approved: hashed userinfo bootstrap, username or email login, 8-hour HMAC HttpOnly cookie, nav Login/Logout, public Dashboard, and no account-management page or user API. |
| G3 | developer | approved | Thien Mai | 2026-11-09 | Implementation approved. 59 unit and scenario tests passed, plus 4 brand QA tests. Live Express and Worker walkthroughs were not run because .env and .dev.vars were absent. |
| G4 | qa | approved | Thien Mai | 2026-11-09 | QA passed. Login coverage is in src/login-qa.test.js. No live MongoDB or browser session was run. Reviewer may push and open the pull request. |
