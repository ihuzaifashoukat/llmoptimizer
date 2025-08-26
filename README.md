## llmoptimizer

Generate an llms.txt that gives AI models a clean, structured summary of your website or docs. It works with any site and has first-class helpers for popular frameworks (Vite, Next.js, Nuxt, Astro, Remix), plus a docs generator for Markdown/MDX.

Node.js 18+ is required.

---

## Why This Matters

- Clear signal for AI: Produce a compact, consistent llms.txt that lists your important pages with key metadata, headings, and structured data.
- Multiple input modes: Crawl a live site, read a sitemap, scan static builds, or run framework-aware adapters without extra setup.
- Docs-first: Generate llms.txt and llms-full.txt directly from Markdown/MDX, including optional sectioned link lists and concatenated context files.
- Robots made easy: Generate a robots.txt that explicitly allows popular search and LLM crawlers, and auto-includes your sitemap.

---

## Install

```
npm install --save-dev llmoptimizer
```

---

## Quick Starts

Pick the scenario that matches your project. All commands write llms.txt by default.

```
# 1) Crawl production
npx llmoptimizer generate --url https://example.com --out public/llms.txt --max-pages 200

# 2) Use a sitemap
npx llmoptimizer generate --sitemap https://example.com/sitemap.xml --out llms.txt

# 3) Scan a static export (e.g., Next.js out/)
npx llmoptimizer generate --root ./out --out ./out/llms.txt

# 4) Build-scan (no crawling): search common build dirs for HTML
npx llmoptimizer generate --build-scan --project-root . --out llms.txt

# 5) Docs (Markdown/MDX) → llms.txt + llms-full.txt + stats
npx llmoptimizer docs --docs-dir docs --out-dir build --site-url https://example.com --base-url /

# 6) Autodetect best mode (docs → build-scan → adapter → crawl)
npx llmoptimizer auto --url https://example.com

# 7) Generate robots.txt that allows search + LLM crawlers
npx llmoptimizer robots --out public/robots.txt --sitemap https://example.com/sitemap.xml
```

Common flags:
- `--format markdown|json` (default markdown)
- `--include <glob...>` / `--exclude <glob...>` to filter routes/files
- `--concurrency <n>` and `--delay-ms <ms>` for performance/throttling
- `--no-robots` to skip robots.txt checks in network modes

---

## What llmoptimizer Generates

llmoptimizer extracts and summarizes the signals that matter to AI and search.

- Site summary: base URL, generation time, totals
- Per page (varies by mode):
  - Basics: URL, title, description, canonical
  - Metadata: robots meta, keywords, social (OpenGraph/Twitter)
  - Structure: H1–H4 headings, snippets, estimated words/tokens
  - Links/media: internal/external link counts, images, missing alt counts
  - Structured data: schema.org JSON‑LD types summary

Docs mode also emits:
- `llms.txt`: Sectioned link list (or auto-grouped) with a short intro
- `llms-full.txt`: Concatenated cleaned content for all docs
- `llms-stats.json`: Headings, words, token estimates per doc + totals
- Optional: `llms-ctx.txt` and `llms-ctx-full.txt` context bundles

---

## CLI Overview

1) Generate from a site/build

```
npx llmoptimizer generate [options]

# Modes
  --url <https://...>           # crawl production (obeys robots by default)
  --sitemap <url>               # seed from sitemap.xml
  --root <dir>                  # scan a static export/build dir for HTML
  --build-scan                  # scan common build dirs under --project-root
  --adapter --project-root .    # framework-aware route fetch (when supported)

# Output & format
  --out <file>                  # default: llms.txt
  --format markdown|json
  --theme default|compact|detailed

# Filtering & perf
  --include <glob...> --exclude <glob...>
  --max-pages <n> --concurrency <n> --delay-ms <ms>
  --no-robots
```

2) Docs (Markdown/MDX) → llms files

```
npx llmoptimizer docs \
  --docs-dir docs --out-dir build --site-url https://example.com --base-url / \
  --include-blog --blog-dir blog \
  --ignore "advanced/*" "private/*" \
  --order "getting-started/*" "guides/*" "api/*" \
  --ignore-path docs --add-path api \
  --exclude-imports --remove-duplicate-headings \
  --generate-markdown-files \
  --emit-ctx --ctx-out llms-ctx.txt --ctx-full-out llms-ctx-full.txt \
  --llms-filename llms.txt --llms-full-filename llms-full.txt \
  --stats-file llms-stats.json \
  --title "Your Docs" --description "Great docs" --version 1.0.0 \
  --sections-file ./examples/sections.json \
  --optional-links-file ./examples/optional-links.json
```

What “sections” mean:
- You can provide explicit sections as JSON (see `examples/sections.json`).
- Or omit them and let auto-sections group content like Getting Started, Guides, API, Tutorials, Reference.
- “Optional” links are supported via a separate JSON file (see `examples/optional-links.json`).

3) Autodetect best mode

```
npx llmoptimizer auto \
  --project-root . \
  --url https://example.com \
  --out llms.txt --format markdown --concurrency 8 --max-pages 200 --delay-ms 0
```

4) Robots.txt generator

```
npx llmoptimizer robots \
  --out public/robots.txt \
  --sitemap https://example.com/sitemap.xml \
  --no-allow-all        # optional: do not add Allow: /
  --no-llm-allow        # optional: skip explicit LLM bot allow-list
  --no-search-allow     # optional: skip search bot allow-list
  --search-bot Googlebot --search-bot Bingbot  # override bots
```

It allows popular LLM crawlers (e.g., GPTBot, Google‑Extended, Claude, Perplexity, CCBot, Applebot‑Extended, Meta‑ExternalAgent, Amazonbot, Bytespider) and mainstream search bots (Googlebot, Bingbot, DuckDuckBot, Slurp, Baiduspider, YandexBot).

---

## Configuration (optional)

Create `llmoptimizer.config.ts` if you prefer defaults on the CLI.

```ts
// llmoptimizer.config.ts
import { defineConfig } from 'llmoptimizer'

export default defineConfig({
  baseUrl: 'https://example.com',
  obeyRobots: true,
  maxPages: 200,
  concurrency: 8,
  network: { delayMs: 100, sitemap: { concurrency: 6, delayMs: 50 } },
  render: { theme: 'default' },
  output: { file: 'public/llms.txt', format: 'markdown' },
  robots: {
    outFile: 'public/robots.txt',
    allowAll: true,
    llmAllow: true,
    searchAllow: true,
    sitemaps: ['https://example.com/sitemap.xml'],
  },
})
```

---

## Framework Integrations

All integrations default to writing llms.txt. You can swap to JSON via `format: 'json'`.

- Vite (React/Vue/Svelte/Solid/Preact)
  ```ts
  // vite.config.ts
  import { defineConfig } from 'vite'
  import { llmOptimizer } from 'llmoptimizer/vite'

  export default defineConfig({
    plugins: [
      llmOptimizer({
        mode: 'static', // or 'crawl' with baseUrl
        robots: { outFile: 'dist/robots.txt' },
      }),
    ],
  })
  ```

- Next.js
  ```ts
  // scripts/postbuild-llm.ts
  import { runAfterNextBuild } from 'llmoptimizer/next'
  await runAfterNextBuild({
    projectRoot: process.cwd(),
    baseUrl: 'https://yourdomain.com',
    outFile: 'public/llms.txt',
    mode: 'adapter', // 'static' with staticDir or 'crawl'
    robots: true,
  })
  // package.json
  // { "scripts": { "postbuild": "node scripts/postbuild-llm.ts" } }
  ```

- Nuxt 3 (Nitro)
  ```ts
  // nuxt.config.ts
  export default defineNuxtConfig({
    modules: [['llmoptimizer/nuxt', { mode: 'static' }]],
  })
  // For crawl mode, add { baseUrl: 'https://yourdomain.com' }
  ```

- Astro
  ```ts
  // astro.config.mjs
  import { defineConfig } from 'astro/config'
  import llm from 'llmoptimizer/astro'
  export default defineConfig({ integrations: [llm({ mode: 'static' })] })
  ```

- Remix
  ```ts
  // scripts/postbuild-llm.mjs
  import { runAfterRemixBuild } from 'llmoptimizer/remix'
  await runAfterRemixBuild({ mode: 'crawl', baseUrl: 'https://your.app', outFile: 'public/llms.txt' })
  ```

- Generic Node/SSR
  ```ts
  // scripts/postbuild-llm.mjs
  import { runAfterBuild } from 'llmoptimizer/node'
  await runAfterBuild({ mode: 'crawl', baseUrl: 'https://yourdomain.com', outFile: 'llms.txt' })
  ```

---

## Docs Integration Details (Markdown/MDX)

Use the CLI or the API. The integration cleans content, removes duplicate headings, optionally inlines local partials, and can generate cleaned per-doc .md files.

Programmatic example:
```ts
// scripts/generate-docs-llm.mjs
import { docsLLMs } from 'llmoptimizer/docs'

const plugin = docsLLMs({
  docsDir: 'docs',
  includeBlog: true,
  ignoreFiles: ['advanced/*', 'private/*'],
  includeOrder: ['getting-started/*', 'guides/*', 'api/*'],
  pathTransformation: { ignorePaths: ['docs'], addPaths: ['api'] },
  excludeImports: true,
  removeDuplicateHeadings: true,
  generateMarkdownFiles: true,
  autoSections: true,
  // Optional: explicit sections/links
  // sections: [...],
  // optionalLinks: [...],
})

await plugin.postBuild({
  outDir: 'build',
  siteConfig: { url: 'https://example.com', baseUrl: '/', title: 'Docs', tagline: 'Great docs' },
})
```

Outputs in `build/`:
- `llms.txt` and `llms-full.txt`
- `llms-stats.json` with word/token estimates
- Optionally `llms-ctx.txt` and `llms-ctx-full.txt` (when `emitCtx`)
- Optional cleaned per-doc `.md` files used for link targets

See `examples/sections.json` and `examples/optional-links.json` for input formats.

---

## Smart Autoregistration (Auto)

Prefer one helper that “just works”? Use the auto integration in a postbuild script. It picks from docs → build → adapter → crawl based on your repo and writes the right output.

```ts
// scripts/auto-llm.mjs
import { autoPostbuild } from 'llmoptimizer/auto'
const res = await autoPostbuild({ baseUrl: 'https://example.com', log: true })
console.log(res) // { mode: 'docs'|'build'|'adapter'|'crawl', outPath: '...' }
```

Add to package.json: `{ "scripts": { "postbuild": "node scripts/auto-llm.mjs" } }`.

---

## Best Practices

- Titles and descriptions: Ensure every page has good `<title>` and meta description.
- Structured data: Use JSON‑LD for key entities; we summarize types in output.
- Headings: Keep H1–H3 clear and scannable; these are extracted.
- Internationalization: Use `<html lang>` and `hreflang` alternates when applicable.
- Sitemaps: Keep `sitemap.xml` fresh for coverage.
- Robots: Use the robots generator to allow search + LLM crawlers on public content.

---

## Troubleshooting

- Empty or few pages: Check `--include/--exclude` filters and robots settings; try `--no-robots` for testing.
- Dynamic routes (adapter mode): Provide sample params or ensure your framework exposes discoverable routes.
- Rate limits: Lower `--concurrency` and add `--delay-ms` when crawling.
- Wrong links in docs mode: Adjust `--ignore-path/--add-path` or provide `--site-url/--base-url`.

---

## Contact

- Email: ihuzaifashoukat@gmail.com
- GitHub: https://github.com/ihuzaifashoukat

---

## License

MIT
