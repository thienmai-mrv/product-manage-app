# Security

**Last updated:** YYYY-MM-DD

## Secrets

| Name | Where set | Never write to |
|---|---|---|
| `MONGODB_URI` | `.env`, `.dev.vars`, Cloudflare Worker secret | source, `wrangler.toml`, memory, OpenSpec |

## Trust boundaries

|

## Input validation

|

## AuthN / AuthZ

|

## Dependency and supply-chain notes

|

## Review checklist

- [ ] No secrets in diff
- [ ] No new trust of client input without validation
- [ ] Worker and Express share the same validation
