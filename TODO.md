# TODO / Roadmap

High impact
- Verbose mode and structured logging (CLI flag, env var)
- Source maps for adapter inferences (explain why each route was included)
- Parallel sitemap traversal with backoff/retry policy
- Fetch external links for docs context files (with throttling/backoff)
- Stronger schema validation for sections/links (beyond CLI zod)
- Configurable token estimation strategies (heuristics vs model-based)
- Incremental generation with content hashing and change detection

Adapters
- Next: parse next.config for i18n locales and add `lang` samples
- Nuxt: infer i18n and content slugs from `content/` or `pages/blog`
- Remix/SvelteKit: infer param samples from filesystem and config
- Gatsby: optional ts-node/esbuild loader for `gatsby-node.ts` (opt-in)

Crawling & performance
- Rate limiting: token-bucket with per-host config
- Respect Crawl-delay from robots.txt (if present)
- Cache fetched pages and sitemaps (etag/last-modified)

Integrations
- GitHub Action: auto-detect project type and choose best generation mode (expand workflow examples)
- Angular builder / Nx plugin wrappers
- SvelteKit plugin wrapper (postbuild)

DX & Docs
- Add examples repo with multiple frameworks
- Generate sample `llms.txt` snapshots for diffing in CI
- More beginner-friendly quickstart videos/gifs
- Sync CLI version string with package.json
- Audit repo for any lingering `llm.txt` references
- Expand README with more ctx flags and auto-sections examples if needed
