# Runtime Parity (Express ↔ Worker)

**Last updated:** YYYY-MM-DD

## Rule

Every route and API behavior change MUST work identically in:

- Local Express: `src/app.js` (+ `src/routes/*`)
- Cloudflare Worker: `src/worker.js`

## Shared modules

| Module | Path | Shared by |
|---|---|---|

## Divergence map (must stay empty or justified)

| Behavior | Express | Worker | Status |
|---|---|---|---|

## Checklist for every API/route change

- [ ] Express handler updated
- [ ] Worker handler updated the same way
- [ ] Status codes and JSON body shapes match
- [ ] Missing `MONGODB_URI` still returns HTTP 500 `{ "error": "MONGODB_URI is not set" }`
- [ ] No secret written to `wrangler.toml`

## Verification tips

-
