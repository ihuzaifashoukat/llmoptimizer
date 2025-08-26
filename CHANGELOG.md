# Changelog

All notable changes to this project will be documented in this file.

The format is inspired by Keep a Changelog, and this project adheres to Semantic Versioning when possible.

## [1.0.0] - 2025-08-26

Added
- Docs integration (Markdown/MDX): generates `llms.txt`, `llms-full.txt`, and `llms-stats.json` directly from docs.
- Sectioned `llms.txt` support with explicit sections JSON and auto-sectioning fallback.
- Optional links for `llms.txt` (“Optional” section semantics).
- Context bundles for docs: `llms-ctx.txt` (core) and `llms-ctx-full.txt` (includes optional).
- Token estimates in stats JSON; per-doc headings and word counts.
- CLI commands:
  - `docs` (docs → llms files with sections/context/stats).
  - `auto` (autodetect docs → build-scan → adapter → crawl).
  - `robots` (generate robots.txt with allow-lists and sitemaps).
- Framework helpers and integrations:
  - Vite plugin: static/crawl modes, include/exclude, theme, optional robots emission.
  - Next helper: static/adapter/crawl modes, throttling, robots support.
  - Nuxt module: lazy `@nuxt/kit` import, static/crawl modes.
  - Astro/Remix/Node helpers updated to write `llms.txt` by default.
  - Auto helper (`llmoptimizer/auto`): chooses best postbuild strategy and returns mode/outPath.
- Robots generator improvements: explicit allow for popular search and LLM crawlers; optional sitemaps and bot lists; CLI flags to opt-out.
- Examples: `examples/sections.json`, `examples/optional-links.json`.
- CI: workflow example to generate llms files in CI.

Changed
- Default output file renamed from `llm.txt` to `llms.txt` across CLI, config, integrations, and docs.
- README fully rewritten for clarity and beginner-friendliness.

Fixed
- Nuxt integration no longer hard-imports `@nuxt/kit`; uses dynamic import to avoid type resolution errors when Nuxt isn’t installed.

Notes
- The CLI version string may lag behind package.json; see TODO to sync versions in a future patch.

## [0.1.0] - 2025-08-01

Initial release with core generator:
- Generate from URL, sitemap, or static directory.
- Basic framework adapter support.
- Markdown/JSON outputs with themes.

---

[1.0.0]: https://github.com/your-org/llmoptimizer/releases/tag/v1.0.0
[0.1.0]: https://github.com/your-org/llmoptimizer/releases/tag/v0.1.0
