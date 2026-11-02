# Glossary

**Last updated:** 2026-11-02

| Term | Meaning | Avoid confusing with |
|---|---|---|
| change | An OpenSpec feature folder under `openspec/changes/` | git commit |
| capability | An OpenSpec spec area under `openspec/specs/` | npm package |
| memory | Project knowledge under `.ai/memory/` | LLM context window |
| worktree | Isolated git checkout used by Orca for a feature | branch name alone |
| GM0 | Human approval of the initial memory baseline | feature gate G1 |
| GM5 | Human approval of a memory update after a feature | merge itself |
| store | `src/store.js`, the shared Mongo access and validation module | the React storefront or `web/dist` |
| storefront | The `/dashboard` customer view | the `/products` admin page |
| catalog | The product list, especially the dashboard view model in `catalogView.js` | the Mongo collection name alone |
| category name collation | Mongo collation `{ locale: "en", strength: 2 }` used for uniqueness | a case-sensitive string compare |
| seed | Insert of Electronics, Books, Home and three products when both collections are empty | a migration framework |
| fetched order | API list order (`createdAt` descending) before client sort | `newest` sort, which re-sorts and tie-breaks by `id` |
| featured tile | First product after filter and sort, rendered without price or `BUY NOW` | a stored flag |
| chip | A removable dashboard filter pill | a product SKU |
| cart | In-memory counts on `/products`, capped by `quantity` | checkout or the dashboard |
| wishlist heart | In-memory `aria-pressed` set on the dashboard | a saved API resource |
| ASSETS | Worker binding that serves `web/dist` | the Express static middleware |
| local env | `localEnv()` object shaped like a Worker env for Express | `.dev.vars`, which Wrangler reads for the Worker |
| parity | Express and Worker API behavior staying the same | identical process models |
