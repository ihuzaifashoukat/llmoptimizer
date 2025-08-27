#!/usr/bin/env node
import { Command } from 'commander'
import { z } from 'zod'
import { generate, generateFromSitemap, generateFromStatic, generateFromUrl } from './lib/generate'
import { loadConfig } from './lib/config'
import path from 'node:path'
import fs from 'node:fs/promises'
import { generateRobotsTxt } from './lib/robots'

// Lightweight route expander for dump sampling
function expandLike(
  routes: string[],
  params?: Record<string, string[]>,
  routeParams?: Record<string, Record<string, string[]>>
): string[] {
  const defaults: Record<string, string[]> = {
    id: ['1', '2'],
    slug: ['sample', 'example'],
    lang: ['en', 'es'],
    locale: ['en', 'en-US'],
  }
  const getVals = (name: string) => (params?.[name]?.length ? params[name] : defaults[name] ?? ['sample'])
  const out = new Set<string>()
  for (const r of routes) {
    if (!r.includes(':')) { out.add(r); continue }
    const segs = r.split('/')
    let seed = [''] as string[]
    const routeSpecific = routeParams?.[r]
    for (const seg of segs) {
      if (!seg) continue
      const m = seg.match(/^:(.+?)(\*)?$/)
      if (!m) { seed = seed.map((s) => s + '/' + seg); continue }
      const name = m[1]
      const star = Boolean(m[2])
      const vals = routeSpecific?.[name]?.length ? routeSpecific[name] : getVals(name)
      const next: string[] = []
      for (const s of seed) for (const v of vals) next.push(s + '/' + (star ? v + '/extra' : v))
      seed = next
    }
    seed.forEach((s) => out.add(s || '/'))
  }
  return Array.from(out)
}

// SvelteKit: derive route patterns from src/routes
async function svelteKitFsRoutes(projectRoot: string) {
  const { globby } = await import('globby')
  const path = await import('node:path')
  const fs = await import('node:fs/promises')
  const dir = path.join(projectRoot, 'src', 'routes')
  const files = await globby(['**/*', '!**/*.d.ts'], { cwd: dir, dot: false })
  const set = new Set<string>()
  const paramNames = new Set<string>()
  for (const f of files) {
    if (!(/\+page\.|\.svelte$/.test(f))) continue
    const route = toSvelteRouteFromRel(f, path)
    set.add(route)
    const mm = route.match(/:([A-Za-z0-9_]+)/g)
    mm?.forEach((m) => paramNames.add(m.slice(1)))
  }
  // Try to sample a few blog slugs
  const slugs = new Set<string>(['welcome', 'hello-world'])
  try {
    const blog = await globby(['blog/*', 'blog/**/+page.*'], { cwd: dir })
    for (const f of blog) {
      const base = f.split('/').pop() || ''
      const name = base.replace(/\+page\..+$/, '').replace(/\..+$/, '')
      if (name && name !== 'index') slugs.add(name)
    }
  } catch {}
  return { routesFromFs: Array.from(set).sort(), params: Array.from(paramNames), blogSlugSamples: Array.from(slugs).slice(0, 8), buildDirs: ['build'] }
}

function toSvelteRouteFromRel(rel: string, pathMod: typeof import('node:path')): string {
  rel = rel.replace(/^\/+/, '')
  const parts = rel.split(pathMod.sep)
  if (/^\+page(\.|$)/.test(parts[parts.length - 1]) || /^\+layout(\.|$)/.test(parts[parts.length - 1])) parts.pop()
  const mapped = parts.map((seg) =>
    seg
      .replace(/\[(\.\.\.)?(.+?)\]/g, (_m, dots, name) => (dots ? `:${name}*` : `:${name}`))
      .replace(/^\(.*\)$/, '')
  )
  const route = '/' + mapped.filter(Boolean).join('/')
  return route || '/'
}

// Angular: read angular.json for outputPath and scan routing files for path entries
async function angularRouteHints(projectRoot: string) {
  const path = await import('node:path')
  const fs = await import('node:fs/promises')
  const { globby } = await import('globby')
  let projectName: string | undefined
  let outputPath: string | undefined
  try {
    const aj = JSON.parse(await fs.readFile(path.join(projectRoot, 'angular.json'), 'utf8'))
    projectName = aj.defaultProject || Object.keys(aj.projects || {})[0]
    const proj = projectName ? aj.projects?.[projectName] : undefined
    outputPath = proj?.architect?.build?.options?.outputPath
  } catch {}
  const routingFiles = await globby(['src/app/**/*routing*.ts', 'src/app/**/app-routing.module.ts', 'src/app/**/*.ts', '!**/*.spec.ts'], { cwd: projectRoot })
  const routeSet = new Set<string>()
  const lazyModules = new Set<string>()
  const pathRe = /\bpath\s*:\s*['"`]([^'"`]+)['"`]/g
  const loadChildrenArrow = /loadChildren\s*:\s*\(\)\s*=>\s*import\(\s*['"`]([^'"`]+)['"`]\s*\)/g
  const loadChildrenString = /loadChildren\s*:\s*['"`]([^'"`]+)['"`]/g
  for (const rel of routingFiles) {
    try {
      const abs = path.join(projectRoot, rel)
      const src = await fs.readFile(abs, 'utf8')
      let m: RegExpExecArray | null
      while ((m = pathRe.exec(src))) {
        const p = m[1]
        if (typeof p === 'string') routeSet.add(p)
      }
      while ((m = loadChildrenArrow.exec(src))) {
        lazyModules.add(m[1])
      }
      while ((m = loadChildrenString.exec(src))) {
        lazyModules.add(m[1])
      }
    } catch {}
  }
  const routes = Array.from(routeSet).filter((r) => r && r !== '**').map((r) => (r.startsWith('/') ? r : '/' + r))
  return { projectName, outputPath, routes: routes.sort(), lazyModules: Array.from(lazyModules).sort() }
}

// Nuxt: filesystem routes (Nuxt 2 underscore or Nuxt 3 bracket), i18n locales, content slugs
async function nuxtFsRoutes(projectRoot: string) {
  const path = await import('node:path')
  const fs = await import('node:fs/promises')
  const { globby } = await import('globby')
  const pagesDir = path.join(projectRoot, 'pages')
  const exists = await fs.stat(pagesDir).then((s) => s.isDirectory()).catch(() => false)
  const routes = new Set<string>()
  const paramNames = new Set<string>()
  if (exists) {
    const files = await globby(['**/*.{vue,js,ts}', '!**/*.d.ts'], { cwd: pagesDir, dot: false })
    for (const f of files) {
      const r = toNuxtRouteFromRel(f)
      if (!r) continue
      routes.add(r)
      const mm = r.match(/:([A-Za-z0-9_]+)/g)
      mm?.forEach((m) => paramNames.add(m.slice(1)))
    }
  }
  // i18n locales from nuxt.config.* or locales dir
  const locales = new Set<string>()
  try {
    const cfgs = await globby(['nuxt.config.*'], { cwd: projectRoot })
    for (const rel of cfgs) {
      const txt = await fs.readFile(path.join(projectRoot, rel), 'utf8')
      const m = txt.match(/locales\s*:\s*\[([^\]]*)\]/)
      if (m) {
        const raw = m[1]
        const rx = /['\"]([^'\"]+)['\"]/g
        let t: RegExpExecArray | null
        while ((t = rx.exec(raw))) locales.add(t[1])
      }
    }
  } catch {}
  try {
    const locs = await globby(['locales/*.*'], { cwd: projectRoot })
    for (const rel of locs) {
      const base = rel.split('/').pop() || ''
      const code = base.replace(/\..+$/, '')
      if (code) locales.add(code)
    }
  } catch {}
  // Content/blog slugs (when @nuxt/content)
  const blogSlugs = new Set<string>()
  try {
    const md = await globby(['content/**/blog/**/*.{md,mdx,mdoc}', 'content/blog/**/*.{md,mdx,mdoc}'], { cwd: projectRoot })
    for (const rel of md) {
      const name = rel.split('/').pop() || ''
      const slug = name.replace(/\..+$/, '')
      if (slug.toLowerCase() !== 'index') blogSlugs.add(slug)
    }
  } catch {}
  return { routesFromPages: Array.from(routes).sort(), params: Array.from(paramNames).sort(), locales: Array.from(locales).sort(), blogSlugSamples: Array.from(blogSlugs).slice(0, 12), buildDirs: ['.output/public', 'dist'] }
}

function toNuxtRouteFromRel(rel: string) {
  let p = rel.replace(/\\/g, '/').replace(/\.(vue|js|ts)$/i, '')
  p = p.replace(/(^|\/)index$/g, '$1')
  const segs = p.split('/').filter(Boolean)
  const out: string[] = []
  for (let seg of segs) {
    // Nuxt 3 bracket params
    seg = seg.replace(/^\[(\.\.\.)?(.+?)\]$/, (_m, dots, name) => (dots ? `:${name}*` : `:${name}`))
    // Nuxt 2 underscore params
    if (seg.startsWith('_')) seg = ':' + seg.slice(1)
    out.push(seg)
  }
  const route = '/' + out.join('/')
  return route || '/'
}

// Remix: filesystem routes under app/routes with $param, dotted segments, and pathless (parentheses) segments
async function remixFsRoutes(projectRoot: string) {
  const path = await import('node:path')
  const fs = await import('node:fs/promises')
  const { globby } = await import('globby')
  const routesDir = path.join(projectRoot, 'app', 'routes')
  const exists = await fs.stat(routesDir).then((s) => s.isDirectory()).catch(() => false)
  const routes = new Set<string>()
  const params = new Set<string>()
  if (exists) {
    const files = await globby(['**/*.{tsx,jsx,ts,js,md,mdx}'], { cwd: routesDir, dot: false })
    for (const f of files) {
      const r = toRemixRouteFromRel(f)
      if (!r) continue
      routes.add(r)
      const mm = r.match(/:([A-Za-z0-9_]+)/g)
      mm?.forEach((m) => params.add(m.slice(1)))
    }
  }
  return { routesFromFs: Array.from(routes).sort(), params: Array.from(params).sort(), buildDirs: ['public', 'build'] }
}

function toRemixRouteFromRel(rel: string) {
  let p = rel.replace(/\\/g, '/').replace(/\.(tsx|jsx|ts|js|md|mdx)$/i, '')
  // Remove trailing /index
  p = p.replace(/(^|\/)index$/g, '$1')
  const parts = p.split('/')
  const mapped: string[] = []
  for (let seg of parts) {
    if (!seg) continue
    // drop pathless layout segments
    if (/^\(.*\)$/.test(seg)) continue
    // Dotted segments become nested path segments
    const subs = seg.split('.')
    for (let s of subs) {
      if (!s) continue
      if (s.startsWith('$')) mapped.push(':' + s.slice(1))
      else mapped.push(s)
    }
  }
  const route = '/' + mapped.filter(Boolean).join('/')
  return route || '/'
}

const program = new Command()
  .name('llmoptimizer')
  .description('Generate llms.txt summaries for websites (framework-agnostic).')
  .version('1.0.0')

program
  .command('generate')
  .description('Generate llms.txt from a URL, sitemap, or static directory')
  .option('-u, --url <url>', 'Root URL to crawl (respecting robots)')
  .option('-s, --sitemap <url>', 'Sitemap URL to seed URLs')
  .option('-r, --root <dir>', 'Static output directory with HTML files')
  .option('-o, --out <file>', 'Output file path', 'llms.txt')
  .option('-f, --format <fmt>', 'Output format: markdown|json', 'markdown')
  .option('--max-pages <n>', 'Max pages to include (default 100)', '100')
  .option('--concurrency <n>', 'Concurrent fetches (default 5)', '5')
  .option('--fetch-delay-ms <n>', 'Delay between HTTP requests in crawl/adapter (ms)')
  .option('--sitemap-concurrency <n>', 'Concurrent sitemap fetches (default 4)')
  .option('--sitemap-delay-ms <n>', 'Delay between sitemap fetches (ms)')
  .option('--include <glob...>', 'Include URL patterns or file globs')
  .option('--exclude <glob...>', 'Exclude URL patterns or file globs')
  .option('--no-robots', 'Do not fetch/obey robots.txt when crawling URLs')
  .option('--adapter', 'Use framework adapter to infer routes')
  .option('--project-root <dir>', 'Project root for adapter detection', '.')
  .option('--template <file>', 'Path to a JS/TS module exporting a markdown(site,pages) function')
  .option('--params <file>', 'JSON file mapping param name to an array of sample values')
  .option('--route-params <file>', 'JSON file mapping route pattern to param values (e.g., {"/blog/:slug": {"slug": ["a","b"]}})')
  .option('--routes <pattern...>', 'Explicit route patterns to include (e.g., /blog/:slug /docs/:lang/getting-started)')
  .option('--build-scan', 'Scan common build output folders for HTML (no crawling)')
  .option('--build-dirs <dir...>', 'Directories to scan for HTML (relative to project root)')
  .option('--theme <name>', 'Markdown theme: default|compact|detailed|structured', 'structured')
  .action(async (opts) => {
    const cfg = await loadConfig()
    const maxPages = Number(opts.maxPages ?? cfg.maxPages ?? 100)
    const concurrency = Number(opts.concurrency ?? cfg.concurrency ?? 5)
    const format = (opts.format ?? cfg.output?.format ?? 'markdown') as 'markdown' | 'json'
    const theme = (opts.theme ?? cfg.render?.theme ?? 'structured') as 'default' | 'compact' | 'detailed' | 'structured'
    const fetchDelayMs = opts.fetchDelayMs ? Number(opts.fetchDelayMs) : cfg.network?.delayMs
    const sitemapConcurrency = opts.sitemapConcurrency ? Number(opts.sitemapConcurrency) : cfg.network?.sitemap?.concurrency
    const sitemapDelayMs = opts.sitemapDelayMs ? Number(opts.sitemapDelayMs) : cfg.network?.sitemap?.delayMs
    let toMarkdownFn: ((site: any, pages: any[]) => string) | undefined = cfg.render?.markdown as any
    if (opts.template) {
      const mod = await import(pathToFileUrl(opts.template))
      toMarkdownFn = (mod.default ?? mod.markdown) as any
    }

    let paramsMap: Record<string, string[]> | undefined = cfg.params
    let routeParamsMap: Record<string, Record<string, string[]>> | undefined = cfg.routeParams
    if (opts.params) {
      const json = JSON.parse(await fs.readFile(path.resolve(opts.params), 'utf8'))
      paramsMap = json
    }
    if (opts.routeParams) {
      const json = JSON.parse(await fs.readFile(path.resolve(opts.routeParams), 'utf8'))
      routeParamsMap = json
    }

    if (opts.root) {
      const result = await generateFromStatic({
        rootDir: opts.root,
        outFile: opts.out ?? cfg.output?.file ?? 'llms.txt',
        format,
        include: opts.include ?? cfg.include,
        exclude: opts.exclude ?? cfg.exclude,
        toMarkdownFn,
        theme,
        renderOptions: cfg.render?.structured,
      })
      console.log(`Generated ${result.outFile} with ${result.pages.length} pages.`)
      return
    }

    if (opts.buildScan) {
      const { generateFromBuild } = await import('./lib/generate')
      const result = await generateFromBuild({
        projectRoot: opts.projectRoot ?? process.cwd(),
        outFile: opts.out ?? cfg.output?.file ?? 'llms.txt',
        format,
        dirs: opts.buildDirs ?? cfg.buildScan?.dirs,
        toMarkdownFn,
        include: opts.include ?? cfg.include,
        exclude: opts.exclude ?? cfg.exclude,
        theme,
        baseUrl: opts.url ?? cfg.baseUrl,
        concurrency,
        obeyRobots: opts.robots ?? cfg.obeyRobots ?? true,
        requestDelayMs: fetchDelayMs,
        maxPages,
        log: true,
        renderOptions: cfg.render?.structured,
      })
      console.log(`Generated ${result.outFile} with ${result.pages.length} pages (build scan).`)
      return
    }

    if (opts.adapter) {
      const baseUrl = opts.url ?? cfg.baseUrl
      if (!baseUrl) {
        console.error('Adapter mode requires --url (base site URL).')
        process.exit(1)
      }
      const { generateFromAdapter } = await import('./lib/generate')
      const result = await generateFromAdapter({
        projectRoot: opts.projectRoot ?? process.cwd(),
        baseUrl,
        outFile: opts.out ?? cfg.output?.file ?? 'llms.txt',
        format,
        concurrency,
        obeyRobots: opts.robots ?? cfg.obeyRobots ?? true,
        include: opts.include ?? cfg.include,
        exclude: opts.exclude ?? cfg.exclude,
        toMarkdownFn,
        paramsMap,
        paramSamplesFn: cfg.paramSamples,
        routeParamsMap,
        explicitRoutes: opts.routes ?? cfg.routes,
        theme,
        renderOptions: cfg.render?.structured,
      })
      console.log(`Generated ${result.outFile} with ${result.pages.length} pages.`)
      return
    }

    if (opts.sitemap) {
      const result = await generateFromSitemap({
        sitemapUrl: opts.sitemap,
        baseUrl: opts.url ?? cfg.baseUrl,
        outFile: opts.out ?? cfg.output?.file ?? 'llms.txt',
        format,
        maxPages,
        concurrency,
        obeyRobots: opts.robots ?? cfg.obeyRobots ?? true,
        include: opts.include ?? cfg.include,
        exclude: opts.exclude ?? cfg.exclude,
        toMarkdownFn,
        theme,
        sitemapConcurrency: sitemapConcurrency ?? 4,
        sitemapDelayMs: sitemapDelayMs ?? 0,
        renderOptions: cfg.render?.structured,
      })
      console.log(`Generated ${result.outFile} with ${result.pages.length} pages.`)
      return
    }

    if (opts.url || (cfg.baseUrl && !opts.root)) {
      const result = await generateFromUrl({
        baseUrl: opts.url ?? cfg.baseUrl,
        outFile: opts.out ?? cfg.output?.file ?? 'llms.txt',
        format,
        maxPages,
        concurrency,
        obeyRobots: opts.robots ?? cfg.obeyRobots ?? true,
        include: opts.include ?? cfg.include,
        exclude: opts.exclude ?? cfg.exclude,
        toMarkdownFn,
        theme,
        requestDelayMs: fetchDelayMs,
        renderOptions: cfg.render?.structured,
      })
      console.log(`Generated ${result.outFile} with ${result.pages.length} pages.`)
      return
    }

    console.error('Specify one of: --url, --sitemap, --root, --build-scan, or --adapter')
    process.exit(1)
  })

program
  .command('dump')
  .description('Debug: dump discovered routes/params/buildDirs as JSON')
  .option('--project-root <dir>', 'Project root for adapter detection', '.')
  .option('--base-url <url>', 'Optional base URL to fetch a small sample of pages')
  .option('--sample <n>', 'Number of pages to fetch when --base-url is provided (default 5)', '5')
  .option('--scan-build', 'Scan common build output dirs for HTML and include results')
  .option('--build-dirs <dir...>', 'Directories to scan for HTML (relative to project root)')
  .option('--include <glob...>', 'Include URL/file patterns')
  .option('--exclude <glob...>', 'Exclude URL/file patterns')
  .option('--framework-details', 'Include framework-specific route insights (Angular, SvelteKit)', false)
  .option('--out <file>', 'Write JSON to file (default: stdout)')
  .action(async (opts) => {
    const root = path.resolve(opts.projectRoot ?? '.')
    const { detectRoutes } = await import('./adapters')
    const detected = await detectRoutes(root)
    const out: any = { projectRoot: root, detected: Boolean(detected), result: detected }
    // If Next detected, include extractor details
    if (detected) {
      try {
        const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
        if (pkg.dependencies?.next || pkg.devDependencies?.next) {
          const { extractNextRoutes } = await import('./lib/next-extract')
          out.next = await extractNextRoutes(root)
        }
      } catch {}
    }
    // Optional: framework-specific route insights
    if (opts.frameworkDetails) {
      try {
        const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
        // SvelteKit: scan src/routes → derive route patterns and params
        if (pkg.dependencies?.['@sveltejs/kit'] || pkg.devDependencies?.['@sveltejs/kit']) {
          const svelte = await svelteKitFsRoutes(root)
          out.sveltekit = svelte
        }
        // Nuxt: pages/ scanner and i18n/content hints
        if (pkg.dependencies?.nuxt || pkg.devDependencies?.nuxt) {
          const nuxt = await nuxtFsRoutes(root)
          out.nuxt = nuxt
        }
        // Angular: angular.json + scan routing files for path entries
        if (pkg.dependencies?.['@angular/core'] || pkg.devDependencies?.['@angular/core']) {
          const angular = await angularRouteHints(root)
          out.angular = angular
        }
        // Remix: app/routes scanner
        if (pkg.dependencies?.['@remix-run/node'] || pkg.dependencies?.['@remix-run/react'] || pkg.devDependencies?.['@remix-run/node'] || pkg.devDependencies?.['@remix-run/react']) {
          const remix = await remixFsRoutes(root)
          out.remix = remix
        }
      } catch {}
    }
    // Optional: scan build dirs for HTML
    if (opts.scanBuild) {
      const { globby } = await import('globby')
      const buildDirs: string[] = (opts.buildDirs as string[] | undefined) ?? (detected?.buildDirs ?? [
        'dist', 'build', 'out', 'public',
        '.next/server/pages', '.next/server/app', '.next/export',
        '.output/public',
        'build',
        'public',
        'dist', 'dist/*/browser',
      ])
      const scanned: Array<{ dir: string; files: number }> = []
      const pages: Array<{ path: string; route: string; title?: string }> = []
      for (const dir of buildDirs) {
        const absDir = path.join(root, dir)
        try {
          const stat = await fs.stat(absDir)
          if (!stat.isDirectory()) continue
          const files = await globby(['**/*.html', '**/*.htm'], { cwd: absDir, ignore: ['node_modules/**'] })
          scanned.push({ dir, files: files.length })
          // Sample a few and extract titles
          const sample = files.slice(0, 10)
          for (const rel of sample) {
            const abs = path.join(absDir, rel)
            try {
              const html = await fs.readFile(abs, 'utf8')
              const { extractFromHtml } = await import('./lib/extractor')
              const fakeUrl = 'file://' + abs
              const pe = extractFromHtml(fakeUrl, html)
              pages.push({ path: path.join(dir, rel).replace(/\\/g, '/'), route: '/' + rel.replace(/\\/g, '/').replace(/index\.html?$/i, '').replace(/\.html?$/i, ''), title: pe.title })
            } catch {}
          }
        } catch {
          // skip missing
        }
      }
      out.buildScan = { scanned, samplePages: pages }
    }
    // Optional: fetch a small sample of pages from baseUrl
    if (opts.baseUrl) {
      try {
        const baseUrl = opts.baseUrl as string
        const sampleN = Math.max(1, Number(opts.sample ?? 5))
        const routes = (detected?.routes ?? ['/']).filter((r: string) => typeof r === 'string' && r.startsWith('/'))
        const expanded = expandLike(routes, detected?.params, detected?.routeParams)
        const seeds = expanded.slice(0, sampleN).map((r: string) => new URL(r, baseUrl).toString())
        const include = opts.include as string[] | undefined
        const exclude = opts.exclude as string[] | undefined
        const filtered: string[] = []
        function matchSimple(pattern: string, input: string) {
          if (pattern.includes('*')) {
            const re = new RegExp('^' + pattern.split('*').map((s) => s.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')).join('.*') + '$')
            return re.test(input)
          }
          return input.includes(pattern)
        }
        for (const u of seeds) {
          const routePath = new URL(u).pathname
          const matches = (pat: string) => matchSimple(pat, routePath)
          if (include && !include.some(matches)) continue
          if (exclude && exclude.some(matches)) continue
          filtered.push(u)
        }
        const concurrency = 5
        const pages: any[] = []
        let i = 0
        const pool = new Array(concurrency).fill(0)
        const { extractFromHtml } = await import('./lib/extractor')
        async function runOne() {
          while (i < filtered.length) {
            const idx = i++
            const u = filtered[idx]
            try {
              const res = await fetch(u)
              const ct = res.headers.get('content-type') || ''
              if (res.ok && ct.includes('text/html')) {
                const html = await res.text()
                const pe = extractFromHtml(u, html)
                pages.push({ url: u, status: res.status, title: pe.title, description: pe.description, wordCount: pe.wordCount })
              } else {
                pages.push({ url: u, status: res.status })
              }
            } catch {
              pages.push({ url: u, error: true })
            }
          }
        }
        await Promise.all(pool.map(() => runOne()))
        out.sampleFetch = { baseUrl, requested: filtered.length, pages }
      } catch {}
    }
    const json = JSON.stringify(out, null, 2)
    if (opts.out) {
      await fs.mkdir(path.dirname(path.resolve(opts.out)), { recursive: true })
      await fs.writeFile(opts.out, json)
      console.log(`Wrote ${opts.out}`)
    } else {
      console.log(json)
    }
  })

program
  .command('robots')
  .description('Generate robots.txt allowing popular LLM crawlers (and optionally set sitemaps)')
  .option('-o, --out <file>', 'Output file path', 'public/robots.txt')
  .option('--no-allow-all', 'Do not add a general Allow: / for all bots')
  .option('--no-llm-allow', 'Do not add explicit groups for LLM bots')
  .option('--no-search-allow', 'Do not add explicit groups for search engine bots')
  .option('--search-bot <name...>', 'Override list of search engine bots (space-separated)')
  .option('--sitemap <url...>', 'One or more Sitemap URLs')
  .action(async (opts) => {
    const cfg = await loadConfig()
    const outFile = opts.out ?? cfg.robots?.outFile ?? 'public/robots.txt'
    const txt = generateRobotsTxt({
      allowAll: opts.allowAll ?? cfg.robots?.allowAll ?? true,
      llmAllow: opts.llmAllow ?? cfg.robots?.llmAllow ?? true,
      llmBots: cfg.robots?.llmBots,
      searchAllow: opts.searchAllow ?? cfg.robots?.searchAllow ?? true,
      searchBots: (opts.searchBot as string[] | undefined) ?? cfg.robots?.searchBots,
      sitemaps: (opts.sitemap as string[] | undefined) ?? cfg.robots?.sitemaps,
    })
    await fs.mkdir(path.dirname(path.resolve(outFile)), { recursive: true })
    await fs.writeFile(outFile, txt)
    console.log(`Wrote ${outFile}`)
  })

program
  .command('docs')
  .description('Generate llms.txt and llms-full.txt from Markdown/MDX docs (no crawl) and optional stats')
  .option('--out-dir <dir>', 'Build output directory where files are written', 'build')
  .option('--site-url <url>', 'Site origin URL, e.g. https://example.com')
  .option('--base-url <path>', 'Base URL path, e.g. /docs')
  .option('--site-title <title>', 'Site title')
  .option('--site-tagline <tagline>', 'Site tagline/description')
  .option('--docs-dir <dir>', 'Directory containing docs', 'docs')
  .option('--include-blog', 'Include blog content (blogDir)', false)
  .option('--blog-dir <dir>', 'Blog directory', 'blog')
  .option('--ignore <glob...>', 'Ignore file globs (in addition to _*.mdx)')
  .option('--order <glob...>', 'Ordering patterns (rel paths or URLs)')
  .option('--no-unmatched-last', 'Do not include unmatched files last (strict ordering)')
  .option('--ignore-path <seg...>', 'Path segments to ignore when constructing URLs')
  .option('--add-path <seg...>', 'Path segments to prepend when constructing URLs')
  .option('--exclude-imports', 'Remove import/export lines from content')
  .option('--remove-duplicate-headings', 'Remove lines that duplicate the previous H1 text')
  .option('--generate-markdown-files', 'Emit cleaned per-doc markdown files in outDir and link to them from llms.txt')
  .option('--emit-ctx', 'Emit concatenated context files (llms-ctx.txt and llms-ctx-full.txt) from linked docs')
  .option('--ctx-out <file>', 'Filename for context file (core)', 'llms-ctx.txt')
  .option('--ctx-full-out <file>', 'Filename for context file (full including optional links)', 'llms-ctx-full.txt')
  .option('--no-auto-sections', 'Disable automatic section grouping when sections are not provided')
  .option('--llms-filename <name>', 'Filename for links file', 'llms.txt')
  .option('--llms-full-filename <name>', 'Filename for full content file', 'llms-full.txt')
  .option('--stats-file <name>', 'Filename for JSON stats', 'llms-stats.json')
  .option('--title <title>', 'Title to use in generated files')
  .option('--description <desc>', 'Description to use in generated files')
  .option('--version <v>', 'Version string to include')
  .option('--root-content-file <file>', 'Path to a file with additional root content for llms.txt')
  .option('--full-root-content-file <file>', 'Path to a file with additional root content for llms-full.txt')
  .option('--custom-llm-files <file>', 'JSON file describing additional custom LLM outputs')
  .option('--sections-file <file>', 'JSON file describing llms.txt sections')
  .option('--optional-links-file <file>', 'JSON file describing llms.txt optional links')
  .action(async (opts) => {
    const { docsLLMs } = await import('./integrations/docs')
    const rootContent = opts.rootContentFile ? await fs.readFile(path.resolve(opts.rootContentFile), 'utf8') : undefined
    const fullRootContent = opts.fullRootContentFile ? await fs.readFile(path.resolve(opts.fullRootContentFile), 'utf8') : undefined
    let customLLMFiles
    if (opts.customLlmFiles) {
      customLLMFiles = JSON.parse(await fs.readFile(path.resolve(opts.customLlmFiles), 'utf8'))
    }
    const LinkSchema = z.object({ title: z.string(), url: z.string().url().or(z.string()), notes: z.string().optional() })
    const SectionsSchema = z.array(z.object({ name: z.string(), links: z.array(LinkSchema) }))
    const LinksSchema = z.array(LinkSchema)
    let sections
    if (opts.sectionsFile) {
      const raw = JSON.parse(await fs.readFile(path.resolve(opts.sectionsFile), 'utf8'))
      sections = SectionsSchema.parse(raw)
    }
    let optionalLinks
    if (opts.optionalLinksFile) {
      const raw = JSON.parse(await fs.readFile(path.resolve(opts.optionalLinksFile), 'utf8'))
      optionalLinks = LinksSchema.parse(raw)
    }
    const plugin = docsLLMs({
      docsDir: opts.docsDir,
      includeBlog: Boolean(opts.includeBlog),
      blogDir: opts.blogDir,
      ignoreFiles: opts.ignore,
      includeOrder: opts.order,
      includeUnmatchedLast: opts.unmatchedLast ?? true,
      pathTransformation: { ignorePaths: opts.ignorePath, addPaths: opts.addPath },
      excludeImports: Boolean(opts.excludeImports),
      removeDuplicateHeadings: Boolean(opts.removeDuplicateHeadings),
      generateMarkdownFiles: Boolean(opts.generateMarkdownFiles),
      llmsTxtFilename: opts.llmsFilename,
      llmsFullTxtFilename: opts.llmsFullFilename,
      statsOutFile: opts.statsFile,
      autoSections: opts.autoSections ?? true,
      emitCtx: Boolean(opts.emitCtx),
      ctxOutFile: opts.ctxOut,
      ctxFullOutFile: opts.ctxFullOut,
      title: opts.title,
      description: opts.description,
      version: opts.version,
      rootContent,
      fullRootContent,
      customLLMFiles,
      sections,
      optionalLinks,
    })
    if (!plugin.postBuild) throw new Error('docs integration missing postBuild hook')
    await plugin.postBuild({
      outDir: opts.outDir,
      siteConfig: { url: opts.siteUrl, baseUrl: opts.baseUrl, title: opts.siteTitle, tagline: opts.siteTagline },
    })
    console.log(`Docs LLM files written to ${opts.outDir}`)
  })

program
  .command('auto')
  .description('Smart autodetect: docs -> build-scan -> adapter -> crawl')
  .option('--project-root <dir>', 'Project root for detection', '.')
  .option('--url <base>', 'Base site URL for adapter/crawl modes')
  .option('--out <file>', 'Output file for crawl/adapter/build modes', 'llms.txt')
  .option('--format <fmt>', 'Output format: markdown|json', 'markdown')
  .option('--concurrency <n>', 'Concurrent fetches', '8')
  .option('--no-robots', 'Do not obey robots in network modes')
  .option('--max-pages <n>', 'Max pages for crawl', '200')
  .option('--delay-ms <n>', 'Request delay for crawl/adapter (ms)', '0')
  // Docs options (subset)
  .option('--docs-dir <dir>', 'Docs directory', 'docs')
  .option('--include-blog', 'Include blog', false)
  .option('--blog-dir <dir>', 'Blog directory', 'blog')
  .option('--out-dir <dir>', 'Docs output directory', 'build')
  .action(async (opts) => {
    const root = path.resolve(opts.projectRoot ?? '.')
    // 1) Docs detection
    const { globby } = await import('globby')
    const docsDir = path.join(root, opts.docsDir ?? 'docs')
    try {
      const files = await globby(['**/*.md', '**/*.mdx'], { cwd: docsDir, ignore: ['**/_*.md', '**/_*.mdx'] })
      if (files.length) {
        const { docsLLMs } = await import('./integrations/docs')
        const plugin = docsLLMs({ docsDir: opts.docsDir, includeBlog: Boolean(opts.includeBlog), blogDir: opts.blogDir })
        if (!plugin.postBuild) throw new Error('docs integration missing postBuild hook')
        await plugin.postBuild({ outDir: opts.outDir ?? 'build', siteConfig: { url: opts.url, baseUrl: '/', title: undefined, tagline: undefined } })
        console.log(`Autodetect: docs mode → wrote ${opts.outDir}/llms.txt`)
        return
      }
    } catch {}

    // 2) Build-scan detection
    const buildDirs = ['dist', 'build', 'out', '.output/public', '.next/server/pages', '.next/server/app', 'public']
    const { globby: globby2 } = await import('globby')
    let foundHtml = false
    for (const dir of buildDirs) {
      try {
        const abs = path.join(root, dir)
        const files = await globby2(['**/*.html'], { cwd: abs })
        if (files.length) { foundHtml = true; break }
      } catch {}
    }
    if (foundHtml) {
      const { generateFromBuild } = await import('./lib/generate')
      const result = await generateFromBuild({ projectRoot: root, outFile: opts.out, format: opts.format })
      console.log(`Autodetect: build-scan mode → Generated ${result.outFile} (${result.pages.length} pages).`)
      return
    }

    // 3) Adapter if routes are detectable and url provided
    const baseUrl = opts.url
    if (baseUrl) {
      try {
        const { detectRoutes } = await import('./adapters')
        const detected = await detectRoutes(root)
        if (detected?.routes?.length) {
          const { generateFromAdapter } = await import('./lib/generate')
          const result = await generateFromAdapter({
            projectRoot: root,
            baseUrl,
            outFile: opts.out,
            format: opts.format,
            concurrency: Number(opts.concurrency ?? 8),
            obeyRobots: Boolean(opts.robots ?? true),
          })
          console.log(`Autodetect: adapter mode → Generated ${result.outFile} (${result.pages.length} pages).`)
          return
        }
      } catch {}
      // 4) Crawl fallback if url is provided
      const { generateFromUrl } = await import('./lib/generate')
      const result = await generateFromUrl({
        baseUrl,
        outFile: opts.out,
        format: opts.format,
        maxPages: Number(opts.maxPages ?? 200),
        concurrency: Number(opts.concurrency ?? 8),
        obeyRobots: Boolean(opts.robots ?? true),
        requestDelayMs: Number(opts.delayMs ?? 0),
      })
      console.log(`Autodetect: crawl mode → Generated ${result.outFile} (${result.pages.length} pages).`)
      return
    }

    console.error('Autodetect could not determine a mode. Provide --url for crawl/adapter or add docs/build output.')
    process.exit(1)
  })

program.parse()

function pathToFileUrl(p: string) {
  let pathName = path.resolve(p).replace(/\\/g, '/')
  if (pathName[0] !== '/') pathName = '/' + pathName
  return new URL('file://' + pathName).href
}
