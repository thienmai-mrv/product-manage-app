# ADR-002: Per-request MongoClient

**Date:** 2026-11-02
**Status:** accepted
**Change:** none (baseline observed in `src/store.js`)

## Context

The store comment states that Workers cancel sockets when a request ends, so a cached client would block the next request. The same function serves Express.

## Decision

`withDatabase` constructs a `MongoClient` for each operation (`maxPoolSize: 1`), connects, runs index and seed checks, runs the callback, and always `close(true)`.

The category unique index is remembered with the module flag `indexesReady` so later calls in that isolate skip `createIndex`.

## Alternatives considered

| Alternative | Why it was not used |
|---|---|
| Process-wide pooled client | Rejected in code comments because of Worker socket cancellation. |
| HTTP fetch to the Mongo Data API | Not present. The official `mongodb` driver is the dependency. |

## Consequences

- Each API call pays for connect and close. Timeouts are 8s selection/connect and 20s socket.
- Express does not get a warm pool either, because it shares this function.
- `indexesReady` is not keyed by database name (KI-005).
- Seed and the user operation share one connection.

## Follow-ups

- None required for the baseline. A future connection cache would need a Worker-safe design and a new decision.
