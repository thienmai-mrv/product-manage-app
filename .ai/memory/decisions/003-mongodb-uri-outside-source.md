# ADR-003: MongoDB URI stays out of source

**Date:** 2026-11-02
**Status:** accepted
**Change:** none (baseline observed in `wrangler.toml`, `.gitignore`, and `openspec/config.yaml`)

## Context

The app connects to MongoDB with a connection string. That string is a credential. Cloudflare deploys from `wrangler.toml`, which is committed.

## Decision

`MONGODB_URI` is supplied only at runtime:

- Express: `.env` or the process environment, read by `src/env.js`
- Local Worker: `.dev.vars`
- Deployed Worker: Cloudflare secret binding, not a `[vars]` entry

`MONGODB_DB` is a non-secret variable and is committed as `productmanage`. `keep_vars = true` lets other dashboard variables survive deploy. The URI itself is not listed in `wrangler.toml`.

## Alternatives considered

| Alternative | Why it was not used |
|---|---|
| Commit the URI in `wrangler.toml` | Forbidden by `openspec/config.yaml` and the README. |
| Build-time injection into the client bundle | The browser never receives the URI. Only the server and Worker read it. |

## Consequences

- A missing URI is an operational failure, surfaced as HTTP 500 `{ "error": "MONGODB_URI is not set" }`.
- Example files may show a placeholder. Real values stay gitignored.
- Memory and OpenSpec must not copy live connection strings.

## Follow-ups

- Preview deploys do not inherit production secrets. README documents a separate preview secret step. That procedure was not re-run during memory init.
