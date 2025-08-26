import fs from 'node:fs/promises'
import path from 'node:path'
import { crawl } from './crawler'
import { extractFromHtml } from './extractor'
import { toMarkdown, renderMarkdown } from './markdown'
import { parseSitemapUrls } from './sitemap'
import type { OutputFormat, PageExtract, SiteSummary } from './types'
import { globby } from 'globby'
import { detectRoutes } from '../adapters'

export interface GenerateCommonOptions {
  outFile: string
  format: OutputFormat
  include?: string[]
  exclude?: string[]
  toMarkdownFn?: (site: SiteSummary, pages: PageExtract[]) => string
  theme?: 'default' | 'compact' | 'detailed'
}

export async function generateFromUrl(opts: {
  baseUrl: string
  maxPages: number
  concurrency: number
  obeyRobots: boolean
  requestDelayMs?: number
} & GenerateCommonOptions) {
  const crawlRes = await crawl({
    startUrls: [opts.baseUrl],
    baseUrl: opts.baseUrl,
    maxPages: opts.maxPages,
    concurrency: opts.concurrency,
    requestDelayMs: opts.requestDelayMs,
    obeyRobots: opts.obeyRobots,
    include: opts.include,
    exclude: opts.exclude,
  })
  const pages = extractAll(crawlRes)
  return writeOutput({
    pages,
    outFile: opts.outFile,
    format: opts.format,
    site: { baseUrl: opts.baseUrl, generatedAt: new Date().toISOString(), pageCount: pages.length, locales: localesFrom(pages) },
    toMarkdownFn: opts.toMarkdownFn,
  })
}

export async function generateFromSitemap(opts: {
  sitemapUrl: string
  baseUrl?: string
  maxPages: number
  concurrency: number
  obeyRobots: boolean
  sitemapConcurrency?: number
  sitemapDelayMs?: number
} & GenerateCommonOptions) {
  const seeds = await collectSitemapUrls({ entry: opts.sitemapUrl, baseUrl: opts.baseUrl, limit: opts.maxPages, concurrency: opts.sitemapConcurrency ?? 4, delayMs: opts.sitemapDelayMs ?? 0 })
  const crawlRes = await crawl({
    startUrls: seeds.slice(0, opts.maxPages),
    baseUrl: opts.baseUrl ?? seeds[0],
    maxPages: opts.maxPages,
    concurrency: opts.concurrency,
    obeyRobots: opts.obeyRobots,
    include: opts.include,
    exclude: opts.exclude,
  })
  const pages = extractAll(crawlRes)
  return writeOutput({
    pages,
    outFile: opts.outFile,
    format: opts.format,
    site: { baseUrl: opts.baseUrl, generatedAt: new Date().toISOString(), pageCount: pages.length, locales: localesFrom(pages) },
    toMarkdownFn: opts.toMarkdownFn,
  })
}

export async function generateFromStatic(opts: { rootDir: string } & GenerateCommonOptions) {
  const root = path.resolve(opts.rootDir)
  const files = await globby(['**/*.html', '**/*.htm'], { cwd: root, ignore: ['node_modules/**'] })
  const pages: PageExtract[] = []
  for (const rel of files) {
    const abs = path.join(root, rel)
    const html = await fs.readFile(abs, 'utf8')
    const fakeUrl = 'file://' + abs
    const pe = extractFromHtml(fakeUrl, html)
    try { const st = await fs.stat(abs); pe.lastModified = st.mtime.toISOString() } catch {}
    pages.push(pe)
  }
  return writeOutput({
    pages,
    outFile: opts.outFile,
    format: opts.format,
    site: { baseUrl: undefined, generatedAt: new Date().toISOString(), pageCount: pages.length, locales: localesFrom(pages) },
    toMarkdownFn: opts.toMarkdownFn,
    theme: opts.theme,
  })
}

export async function generate(pages: { url: string; html: string }[], opts: GenerateCommonOptions & { baseUrl?: string }) {
  const extracts = pages.map((p) => extractFromHtml(p.url, p.html))
  return writeOutput({
    pages: extracts,
    outFile: opts.outFile,
    format: opts.format,
    site: { baseUrl: opts.baseUrl, generatedAt: new Date().toISOString(), pageCount: extracts.length, locales: localesFrom(extracts) },
    toMarkdownFn: opts.toMarkdownFn,
  })
}

function extractAll(items: { url: string; status: number; html?: string }[]): PageExtract[] {
  return items
    .filter((p) => p.status > 0 && p.html)
    .map((p) => extractFromHtml(p.url, p.html!))
}

async function writeOutput({ pages, outFile, format, site, toMarkdownFn, theme }: { pages: PageExtract[]; outFile: string; format: OutputFormat; site: SiteSummary; toMarkdownFn?: (site: SiteSummary, pages: PageExtract[]) => string; theme?: 'default' | 'compact' | 'detailed' }) {
  await fs.mkdir(path.dirname(path.resolve(outFile)), { recursive: true })
  if (format === 'json') {
    const json = JSON.stringify({ site, pages }, null, 2)
    await fs.writeFile(outFile, json)
  } else {
    const md = toMarkdownFn ? toMarkdownFn(site, pages) : renderMarkdown(site, pages, theme ?? 'default')
    await fs.writeFile(outFile, md)
  }
  return { outFile, pages, site }
}

function localesFrom(pages: PageExtract[]): string[] | undefined {
  const s = new Set<string>()
  for (const p of pages) if (p.locale) s.add(p.locale)
  return s.size ? Array.from(s) : undefined
}

async function collectSitemapUrls({ entry, baseUrl, limit, concurrency, delayMs }: { entry: string; baseUrl?: string; limit: number; concurrency: number; delayMs: number }): Promise<string[]> {
  const out = new Set<string>()
  const seen = new Set<string>()
  const queue = new Set<string>([entry])
  let last = 0
  async function runOne(url: string) {
    if (seen.has(url) || out.size >= limit) return
    seen.add(url)
    try {
      if (delayMs) {
        const now = Date.now()
        const wait = Math.max(0, last + delayMs - now)
        if (wait) await new Promise((r) => setTimeout(r, wait))
        last = Date.now()
      }
      const res = await fetch(url)
      if (!res.ok) return
      const xml = await res.text()
      let urls = await parseSitemapUrls(xml)
      if (baseUrl) {
        const origin = new URL(baseUrl).origin
        urls = urls.filter((u) => new URL(u, origin).origin === origin)
      }
      for (const u of urls) {
        if (out.size >= limit) break
        if (/\.xml($|\?)/i.test(u)) queue.add(u)
        else out.add(u)
      }
    } catch {
      // ignore
    }
  }
  while (queue.size && out.size < limit) {
    const batch = Array.from(queue).slice(0, concurrency)
    batch.forEach((u) => queue.delete(u))
    await Promise.all(batch.map((u) => runOne(u)))
  }
  return Array.from(out)
}

// Build scan: find HTML in common build output folders and generate without network crawling
export async function generateFromBuild(opts: {
  projectRoot?: string
  outFile: string
  format: OutputFormat
  dirs?: string[]
  toMarkdownFn?: (site: SiteSummary, pages: PageExtract[]) => string
  include?: string[]
  exclude?: string[]
  theme?: 'default' | 'compact' | 'detailed'
}) {
  const root = path.resolve(opts.projectRoot ?? process.cwd())
  let candidates = opts.dirs ?? []
  if (!candidates.length) {
    try {
      const detected = await detectRoutes(root)
      if (detected?.buildDirs?.length) candidates.push(...detected.buildDirs)
    } catch {}
  }
  if (!candidates.length) candidates = ['dist', 'build', 'out', '.output/public', '.next/server/pages', '.next/server/app', 'public']
  const pages: PageExtract[] = []
  for (const dir of candidates) {
    const absDir = path.join(root, dir)
    try {
      const stat = await fs.stat(absDir)
      if (!stat.isDirectory()) continue
      const files = await globby(['**/*.html', '**/*.htm'], { cwd: absDir, ignore: ['node_modules/**'] })
      for (const rel of files) {
        const routePath = toRoutePath(rel)
        if (opts.include && !opts.include.some((p) => matchSimple(p, routePath))) continue
        if (opts.exclude && opts.exclude.some((p) => matchSimple(p, routePath))) continue
        const abs = path.join(absDir, rel)
        const html = await fs.readFile(abs, 'utf8')
        const fakeUrl = 'file://' + abs
        const pe = extractFromHtml(fakeUrl, html)
        try { const st = await fs.stat(abs); pe.lastModified = st.mtime.toISOString() } catch {}
        pages.push(pe)
      }
    } catch {
      // ignore missing
    }
  }
  return writeOutput({
    pages,
    outFile: opts.outFile,
    format: opts.format,
    site: { baseUrl: undefined, generatedAt: new Date().toISOString(), pageCount: pages.length, locales: localesFrom(pages) },
    toMarkdownFn: opts.toMarkdownFn,
    theme: opts.theme,
  })
}

function toRoutePath(rel: string) {
  let p = rel.replace(/\\/g, '/').replace(/index\.html?$/i, '')
  p = p.replace(/\.html?$/i, '')
  return '/' + p.replace(/^\/+/, '')
}

function matchSimple(pattern: string, input: string) {
  if (pattern.includes('*')) {
    const re = new RegExp('^' + pattern.split('*').map(escapeRegExp).join('.*') + '$')
    return re.test(input)
  }
  return input.includes(pattern)
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function generateFromAdapter(opts: {
  projectRoot: string
  baseUrl: string
  outFile: string
  format: OutputFormat
  concurrency: number
  obeyRobots: boolean
  include?: string[]
  exclude?: string[]
  toMarkdownFn?: (site: SiteSummary, pages: PageExtract[]) => string
  paramsMap?: Record<string, string[]>
  paramSamplesFn?: (name: string) => string[]
  routeParamsMap?: Record<string, Record<string, string[]>>
  explicitRoutes?: string[]
  theme?: 'default' | 'compact' | 'detailed'
}) {
  const detected = await detectRoutes(opts.projectRoot)
  const routes = detected?.routes ?? []
  const expanded = expandRoutesWithParams(routes, opts.paramsMap, opts.paramSamplesFn, opts.routeParamsMap)
  const seeds = [...expanded, ...(opts.explicitRoutes || [])]
  const staticRoutes = seeds.filter((r) => !r.includes(':'))
  if (!staticRoutes.length) {
    // Fallback to base crawl if no routes found
    return generateFromUrl({
      baseUrl: opts.baseUrl,
      maxPages: 100,
      concurrency: opts.concurrency,
      obeyRobots: opts.obeyRobots,
      outFile: opts.outFile,
      format: opts.format,
      include: opts.include,
      exclude: opts.exclude,
      toMarkdownFn: opts.toMarkdownFn,
    })
  }

  const urls = staticRoutes.map((r) => new URL(r, opts.baseUrl).toString())
  const pages: PageExtract[] = []
  const limiter: Array<Promise<void>> = []
  const pool = new Array(opts.concurrency).fill(0)
  let i = 0
  const robots = opts.obeyRobots ? await loadRobotsFor(opts.baseUrl) : undefined
  const next = async () => {
    while (i < urls.length) {
      const idx = i++
      const u = urls[idx]
      if (robots && !robotsAllowedUrl(robots, u)) continue
      try {
        const res = await fetch(u)
        const ct = res.headers.get('content-type') || ''
        if (res.ok && ct.includes('text/html')) {
          const html = await res.text()
          pages.push(extractFromHtml(u, html))
        }
      } catch {
        // ignore
      }
    }
  }
  for (let k = 0; k < pool.length; k++) limiter.push(next())
  await Promise.all(limiter)
  return writeOutput({
    pages,
    outFile: opts.outFile,
    format: opts.format,
    site: { baseUrl: opts.baseUrl, generatedAt: new Date().toISOString(), pageCount: pages.length, locales: localesFrom(pages) },
    toMarkdownFn: opts.toMarkdownFn,
    theme: opts.theme,
  })
}

async function loadRobotsFor(baseUrl: string) {
  try {
    const origin = new URL(baseUrl).origin
    const res = await fetch(origin.replace(/\/$/, '') + '/robots.txt')
    if (!res.ok) return undefined
    const txt = await res.text()
    return parseRobotsTxt(txt)
  } catch { return undefined }
}

function parseRobotsTxt(txt: string) {
  const lines = txt.split(/\r?\n/)
  const allow: string[] = []
  const disallow: string[] = []
  let star = false
  for (const ln of lines) {
    const l = ln.trim()
    if (!l || l.startsWith('#')) continue
    const [k, vRaw] = l.split(':', 2)
    const key = k?.toLowerCase().trim()
    const val = vRaw?.trim() ?? ''
    if (key === 'user-agent') star = val === '*'
    else if (key === 'allow' && star) { if (val) allow.push(val) }
    else if (key === 'disallow' && star) { if (val) disallow.push(val) }
  }
  return { allow, disallow }
}

function robotsAllowedUrl(robots: { allow: string[]; disallow: string[] }, url: string) {
  try {
    const u = new URL(url)
    const p = u.pathname
    const longest = (arr: string[]) => arr.filter(Boolean).filter((r) => p.startsWith(r)).reduce((a, b) => (a.length >= b.length ? a : b), '')
    const a = longest(robots.allow)
    const d = longest(robots.disallow)
    return a.length >= d.length
  } catch { return true }
}

function expandRoutesWithParams(
  routes: string[],
  paramsMap?: Record<string, string[]>,
  paramSamplesFn?: (name: string) => string[],
  routeParamsMap?: Record<string, Record<string, string[]>>
) {
  const defaults: Record<string, string[]> = {
    id: ['1', '2'],
    slug: ['sample', 'example'],
    lang: ['en', 'es'],
    locale: ['en', 'en-US'],
  }
  const getValues = (name: string) => {
    if (paramsMap && paramsMap[name]?.length) return paramsMap[name]
    const fnVals = paramSamplesFn?.(name)
    if (fnVals && fnVals.length) return fnVals
    return defaults[name] ?? ['sample']
  }
  const out = new Set<string>()
  for (const r of routes) {
    if (!r.includes(':')) { out.add(r); continue }
    // split and expand params
    const segments = r.split('/')
    const seed = [''] as string[]
    const routeSpecific = routeParamsMap?.[r]
    for (const seg of segments) {
      if (!seg) continue
      const match = seg.match(/^:(.+?)(\*)?$/)
      if (!match) {
        for (let i = 0; i < seed.length; i++) seed[i] += '/' + seg
        continue
      }
      const name = match[1]
      const star = Boolean(match[2])
      const vals = routeSpecific?.[name]?.length ? routeSpecific[name] : getValues(name)
      const next: string[] = []
      for (const base of seed) {
        for (const v of vals) {
          next.push(base + '/' + (star ? v + '/extra' : v))
        }
      }
      seed.length = 0
      seed.push(...next)
    }
    for (const s of seed) out.add(s || '/')
  }
  return Array.from(out)
}
