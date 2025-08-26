import pLimit from 'p-limit'
import { URL } from 'node:url'

export interface CrawlOptions {
  startUrls: string[]
  baseUrl?: string
  maxPages: number
  concurrency: number
  requestDelayMs?: number
  obeyRobots: boolean
  include?: string[]
  exclude?: string[]
  fetchImpl?: typeof fetch
}

export interface FetchedPage {
  url: string
  status: number
  contentType?: string
  html?: string
}

export async function crawl(opts: CrawlOptions): Promise<FetchedPage[]> {
  const fetcher = opts.fetchImpl ?? fetch
  const limit = pLimit(opts.concurrency)

  const visited = new Set<string>()
  const enqueued = new Set<string>()
  const queue: string[] = []
  const out: FetchedPage[] = []

  const base = opts.baseUrl ? new URL(opts.baseUrl) : undefined
  const sameOrigin = (u: string) => {
    if (!base) return true
    try {
      const x = new URL(u, base)
      return x.origin === base.origin
    } catch {
      return false
    }
  }

  const robots = opts.obeyRobots && base ? await loadRobots(base.origin, fetcher) : undefined

  const shouldVisit = (u: string) => {
    if (visited.has(u)) return false
    if (robots && !robotsAllowed(robots, u)) return false
    if (!sameOrigin(u)) return false
    // basic include/exclude checks by substring or glob-like simple star
    if (opts.include && opts.include.length > 0) {
      const ok = opts.include.some((p) => matchSimple(p, u))
      if (!ok) return false
    }
    if (opts.exclude && opts.exclude.length > 0) {
      const blocked = opts.exclude.some((p) => matchSimple(p, u))
      if (blocked) return false
    }
    return true
  }

  for (const s of opts.startUrls) {
    if (shouldVisit(s)) { queue.push(s); enqueued.add(s) }
  }

  let lastRequestAt = 0

  async function throttle() {
    const delay = opts.requestDelayMs || 0
    if (!delay) return
    const now = Date.now()
    const wait = Math.max(0, lastRequestAt + delay - now)
    if (wait) await new Promise((r) => setTimeout(r, wait))
    lastRequestAt = Date.now()
  }

  while (queue.length && out.length < opts.maxPages) {
    const batch = queue.splice(0, Math.max(1, Math.min(queue.length, opts.concurrency)))
    const results = await Promise.all(
      batch.map((u) =>
        limit(async () => {
          visited.add(u)
          try {
            await throttle()
            const res = await fetcher(u, { headers: { 'user-agent': 'llmoptimizer/0.2 (+https://npmjs.com/llmoptimizer)' } })
            const ct = res.headers.get('content-type') ?? undefined
            const isHtml = ct?.includes('text/html')
            const html = isHtml ? await res.text() : undefined
            const item: FetchedPage = { url: u, status: res.status, contentType: ct ?? undefined, html }
            if (res.ok && html && out.length < opts.maxPages) {
              // extract links to continue crawl (shallow breadth-first)
              for (const link of extractLinks(html, u)) {
                if (out.length + queue.length >= opts.maxPages) break
                if (shouldVisit(link) && !enqueued.has(link)) { queue.push(link); enqueued.add(link) }
              }
            }
            return item
          } catch {
            return { url: u, status: 0 }
          }
        })
      )
    )
    out.push(...results)
  }

  return out
}

function extractLinks(html: string, baseUrl: string): string[] {
  // naive extraction to avoid a heavy HTML parser here; extractor will do deep parsing later
  const hrefs = Array.from(html.matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi)).map((m) => m[1])
  const urls: string[] = []
  for (const href of hrefs) {
    try {
      const u = new URL(href, baseUrl)
      // stay on http(s) only
      if (!/^https?:$/.test(u.protocol)) continue
      urls.push(u.toString())
    } catch {
      // ignore
    }
  }
  // cap to avoid exploding queue
  return Array.from(new Set(urls)).slice(0, 200)
}

async function loadRobots(origin: string, fetcher: typeof fetch) {
  try {
    const res = await fetcher(origin.replace(/\/$/, '') + '/robots.txt')
    if (!res.ok) return undefined
    const txt = await res.text()
    return parseRobots(txt)
  } catch {
    return undefined
  }
}

function parseRobots(txt: string) {
  // minimal robots parser for User-agent: * with Allow/Disallow; most specific wins
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
    if (key === 'user-agent') {
      star = val === '*' // start of UA group
    } else if (key === 'disallow' && star) {
      if (val) disallow.push(val)
    } else if (key === 'allow' && star) {
      if (val) allow.push(val)
    }
  }
  return { allow, disallow }
}

function robotsAllowed(robots: { allow: string[]; disallow: string[] }, url: string) {
  try {
    const u = new URL(url)
    const path = u.pathname
    const longest = (arr: string[]) => arr.filter(Boolean).filter((r) => path.startsWith(r)).reduce((a, b) => (a.length >= b.length ? a : b), '')
    const a = longest(robots.allow)
    const d = longest(robots.disallow)
    // allow if the most specific rule is Allow; disallow if Disallow is longer
    return a.length >= d.length
  } catch {
    return true
  }
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
