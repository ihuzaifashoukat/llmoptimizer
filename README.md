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

### Structured theme

Use `--theme structured` (or `render.theme: 'structured'` in config) for a more LLM-friendly, categorized Markdown output. It includes:

- Site header with base URL, locales, page count, and totals.
- Categories (Home, Docs, Guides, API, Blog, etc.) with counts and an index.
- Per-page JSON metadata blocks (url/title/description/canonical/locale/metrics/alternates/OG/Twitter) followed by concise headings, links, and images samples.

Example:

# llms.txt — Structured Site Summary
Base URL: https://example.com
Generated: 2025-08-27
Pages: 42
Totals: words=12345 images=120 missingAlt=3 internalLinks=420 externalLinks=88

## Categories
- Docs: 20
- Guides: 8
- Blog: 5
- Other: 9

## Docs (20)
### Getting Started
```json
{ "url": "https://example.com/docs/getting-started", "title": "Getting Started", "metrics": { "wordCount": 950 } }
```
- Headings:
  - H1: Getting Started
  - H2: Installation

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
  --theme default|compact|detailed|structured   # default: structured

# Filtering & perf
  --include <glob...> --exclude <glob...>
  --max-pages <n> --concurrency <n> --delay-ms <ms>
  --no-robots
```

3) Debug dump (routes/build/sample)

```
npx llmoptimizer dump \
  --project-root . \
  --base-url https://example.com --sample 5 \
  --scan-build --build-dirs dist .next/server/pages \
  --framework-details \
  --include "/docs/*" --exclude "/admin/*" \
  --out dump.json
```

Outputs JSON including:
- Adapter detection and basic routes/params
- Next.js extractor details (when applicable)
- Framework details (when `--framework-details`):
  - SvelteKit: filesystem-derived route patterns + param names + example blog slugs
  - Nuxt: pages/ routes (Nuxt 2 underscore + Nuxt 3 bracket), i18n locales (best-effort), content/blog slugs
  - Remix: app/routes routes (dotted segments, $params, pathless parentheses), param names
  - Angular: `angular.json` outputPath, extracted `path:` entries and `loadChildren` hints
- Optional build scan results
- Optional sample of fetched pages when `--base-url` is provided

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

Create `llmoptimizer.config.ts` if you prefer defaults on the CLI. Structured is the default theme.

```ts
// llmoptimizer.config.ts
import { defineConfig } from 'llmoptimizer'

export default defineConfig({
  baseUrl: 'https://example.com',
  obeyRobots: true,
  maxPages: 200,
  concurrency: 8,
  network: { delayMs: 100, sitemap: { concurrency: 6, delayMs: 50 } },
  // Themes: 'default' | 'compact' | 'detailed' | 'structured'
  render: {
    theme: 'structured',
    // Optional: customize structured output
    structured: {
      limits: { headings: 16, links: 12, images: 8 },
      categories: {
        // Control section order
        order: ['Home', 'Products', 'Product Categories', 'Docs', 'Guides', 'API', 'Policies', 'Important', 'Blog', 'Company', 'Legal', 'Support', 'Examples', 'Other'],
        // Keyword mapping: match in URL path or H1
        keywords: {
          Products: ['product', 'pricing', 'features'],
          'Product Categories': ['category', 'categories', 'catalog', 'collection'],
          Policies: ['privacy', 'terms', 'cookies', 'policy', 'policies', 'security', 'gdpr'],
          Important: ['status', 'uptime', 'login', 'signup', 'contact'],
        },
      },
    },
  },
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
    baseUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://yourdomain.com',
    outFile: 'public/llms.txt',
    // Choose the strategy:
    // - static: build-scan (.next/server/*, out) with baseUrl mapping → adapter → crawl
    // - adapter: fetch detected routes from baseUrl → build-scan → crawl
    // - crawl: breadth-first crawl baseUrl
    mode: 'static',
    robots: true,
    log: true,
  })
  // package.json
  // { "scripts": { "postbuild": "node scripts/postbuild-llm.ts" } }
  ```

- Nuxt 3 (Nitro)
  ```ts
  // nuxt.config.ts
  export default defineNuxtConfig({
    modules: [[
      'llmoptimizer/nuxt',
      {
        // static: build-scan on .output/public with baseUrl mapping → crawl fallback
        mode: 'static',
        baseUrl: process.env.NUXT_PUBLIC_SITE_URL || 'https://yourdomain.com',
        robots: true,
      },
    ]],
  })
  ```

- Astro
  ```ts
  // astro.config.mjs
  import { defineConfig } from 'astro/config'
  import llm from 'llmoptimizer/astro'
  export default defineConfig({
    integrations: [
      llm({
        // static: build-scan on dist with baseUrl mapping → crawl fallback
        mode: 'static',
        baseUrl: process.env.SITE_URL,
        robots: true,
      })
    ]
  })
  ```

- Remix
  ```ts
  // scripts/postbuild-llm.mjs
  import { runAfterRemixBuild } from 'llmoptimizer/remix'
  await runAfterRemixBuild({
    // static: build-scan on public with baseUrl mapping → crawl fallback
    mode: 'static',
    baseUrl: process.env.SITE_URL || 'https://your.app',
    outFile: 'public/llms.txt',
    robots: true,
  })
  ```

- SvelteKit
  ```ts
  // scripts/sveltekit-postbuild-llm.mjs
  import { runAfterSvelteKitBuild } from 'llmoptimizer/sveltekit'
  await runAfterSvelteKitBuild({
    // static: scan 'build' and map to URLs using baseUrl → crawl fallback if SSR-only
    mode: 'static',
    buildDir: 'build',
    baseUrl: process.env.SITE_URL || 'https://your.app',
    outFile: 'build/llms.txt',
    theme: 'structured',
    // Optional filters and structured theme options
    // include: ['/docs/*'], exclude: ['/admin/*'],
    // renderOptions: { limits: { headings: 12, links: 10, images: 6 } },
    robots: { outFile: 'build/robots.txt' },
  })
  // package.json → { "scripts": { "postbuild": "node scripts/sveltekit-postbuild-llm.mjs" } }
  ```

- Angular
  ```ts
  // scripts/angular-postbuild-llm.mjs
  import { runAfterAngularBuild } from 'llmoptimizer/angular'
  await runAfterAngularBuild({
    // static: scan Angular dist output; distDir auto-detected from angular.json when omitted
    mode: 'static',
    baseUrl: process.env.SITE_URL || 'https://your.app',
    theme: 'structured',
    // Optional: distDir: 'dist/your-project/browser'
    // include/exclude and renderOptions are supported
    robots: { outFile: 'dist/robots.txt' },
  })
  // package.json → { "scripts": { "postbuild": "node scripts/angular-postbuild-llm.mjs" } }
  ```

- Generic Node script
  ```ts
  // scripts/postbuild-llm.ts
  import { runAfterBuild } from 'llmoptimizer/node'
  await runAfterBuild({
    // static: build-scan on dist with baseUrl mapping → crawl fallback
    mode: 'static',
    rootDir: 'dist',
    baseUrl: process.env.SITE_URL,
    robots: true,
  })
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

Notes
- Absolute links: Internal links, canonical, hreflang, and images are resolved to absolute URLs using the page URL. Pass `baseUrl` in static/build-scan modes to avoid file:// URLs.
- Build-scan coverage: When `baseUrl` is provided, build-scan enriches routes using framework artifacts (e.g., Next prerender/routes manifests) and falls back to sitemap or crawl if empty.
- Adapter vs static: Adapter fetches via HTTP from `baseUrl` (requires a reachable server). Static uses build output folders and does not require a running server.

Examples
- Next postbuild: `examples/next-postbuild-llm.mjs`
- Auto detection: `examples/auto-llm.mjs`
- Nuxt config: `examples/nuxt.config.ts`
- Astro config: `examples/astro.config.mjs`
- Remix postbuild: `examples/remix-postbuild-llm.mjs`
- Vite config: `examples/vite.config.mjs`
- Generic Node postbuild: `examples/node-postbuild-llm.mjs`
 - SvelteKit postbuild: `examples/sveltekit-postbuild-llm.mjs`
 - Angular postbuild: `examples/angular-postbuild-llm.mjs`

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
