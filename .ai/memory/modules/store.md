# Module: store

**Last updated:** 2026-11-02
**Paths:** `src/store.js`, `src/env.js`, `src/empty-encryption.cjs`
**OpenSpec:** product and category specs share this module. There is no separate store spec.

## Responsibility

One Mongo data access path for Express and the Worker: connect, index, seed, validate, and map documents to API objects.

## Public surface

| Kind | Name | Notes |
|---|---|---|
| Functions | `listCategories`, `addCategory`, `updateCategory`, `deleteCategory` | Each opens and closes a client. |
| Functions | `listProducts`, `addProduct`, `updateProduct`, `deleteProduct` | Same. |
| Env shape | `{ MONGODB_URI, MONGODB_DB }` | Express builds it in `localEnv()`. Worker passes its binding env. |

## Dependencies

| Depends on | Why |
|---|---|
| `mongodb` driver | `MongoClient` and collections. |
| Database name | `env.MONGODB_DB` or `productmanage`. |
| Network | `serverSelectionTimeoutMS` and `connectTimeoutMS` are 8000. `socketTimeoutMS` is 20000. `maxPoolSize` is 1. |

## Invariants

- Missing `MONGODB_URI` throws HTTP 500 with message `MONGODB_URI is not set` before connecting.
- Client is closed with `close(true)` in `finally`.
- Category index is created once per isolate (`indexesReady`).
- Seed runs inside the same connection, before the caller's operation.
- HTTP errors are `Error` objects with a numeric `status`.
- Mapping omits `updatedAt` when the document has none.
- `toProduct` coerces a non-integer `quantity` to `0`.

## Change tips for agents

- Add new fields here so both runtimes inherit validation.
- Do not cache a `MongoClient` across requests. The file comment says Workers cancel sockets when a request ends.
- Do not log or return the URI.
- The encryption alias is a Worker packaging detail. It does not implement field encryption.

## Related APIs / decisions

- [../decisions/002-per-request-mongo-client.md](../decisions/002-per-request-mongo-client.md)
- [../decisions/003-mongodb-uri-outside-source.md](../decisions/003-mongodb-uri-outside-source.md)
