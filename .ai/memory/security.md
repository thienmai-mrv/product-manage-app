# Security

**Last updated:** 2026-11-02

## Secrets

| Name | Where set | Never write to |
|---|---|---|
| `MONGODB_URI` | `.env` (Express), `.dev.vars` (local Wrangler), Cloudflare Worker secret | source, `wrangler.toml`, memory, OpenSpec, git |
| `MONGODB_DB` | `.env`, `.dev.vars`, `wrangler.toml` `[vars]` and `[previews.vars]` | Not a secret. Default `productmanage`. Safe to commit as the plain variable. |

`.env.example` and `.dev.vars.example` contain placeholder connection strings only. `.gitignore` ignores `.env`, `.dev.vars`, and `data/db.json`.

`loadLocalEnv` does not override variables already present in `process.env`.

## Trust boundaries

| Boundary | What is trusted | Notes |
|---|---|---|
| Browser to API | Nothing in the JSON body. | Store validates name, category id, price, quantity, and image URL. |
| Browser to pages | Same origin. | No cookies, sessions, or CSRF tokens exist. |
| Server to MongoDB | The URI from the environment. | A new client is opened per call and closed in `finally`. |
| Worker assets | Built static files. | API and `/` are handled in the Worker before assets (`run_worker_first`). |
| Observability | Worker logs and traces are enabled in `wrangler.toml`. | `redact_query_string = false`. API calls observed in code do not put secrets in the query string. |

The products page repeats some validation before POST/PUT. The server remains the authority. Category name uniqueness is also enforced by the Mongo index.

Image URLs are not fetched by the server. The browser loads them in `<img>`. A failed image falls back to the placeholder SVG.

## Input validation

- Strings are trimmed. Required text rejects empty results.
- Price must be finite and `>= 0`, then rounded to two decimal places.
- Quantity must be an integer `>= 0`.
- `imageUrl` must be empty or an `http`/`https` URL no longer than 2048 characters.
- `categoryId` must match an existing category document.
- Category names are compared with collation strength 2 and a unique index.
- Worker JSON parse failure becomes HTTP 400. Express uses the framework JSON parser.
- There is no HTML sanitizer. Names and descriptions are rendered as React text nodes, not `dangerouslySetInnerHTML`. No `dangerouslySetInnerHTML` usage was found.

## AuthN / AuthZ

None. Every page and every API verb is available to any caller who can reach the host. Spec scenarios that say "administrator" describe the person using `/products` or `/categories`. They do not describe an implemented role.

`DELETE` is confirmed only in the browser (`window.confirm`). The API deletes without a confirmation token.

## Dependency and supply-chain notes

- Runtime dependencies: `express`, `mongodb`. Dev: `vite`, `wrangler`. Web: `react`, `react-dom`, `react-router-dom`, Vite React plugin.
- `mongodb-client-encryption` is aliased to `src/empty-encryption.cjs` on the Worker so the driver does not load a native addon. Field-level encryption is not configured.
- `wrangler.toml` sets `keep_vars = true` so a deploy does not drop dashboard variables that are not listed in the file. `MONGODB_URI` stays a secret and is not listed.

## Review checklist

- [ ] No secrets in diff
- [ ] No new trust of client input without validation
- [ ] Worker and Express share the same validation
- [ ] New endpoints stay unauthenticated only on purpose
- [ ] Image URL rules stay server-side if the field changes
