import * as cheerio from 'cheerio'
import type { PageExtract } from './types'

export function extractFromHtml(url: string, html: string): PageExtract {
  const $ = cheerio.load(html)

  const title = $('head > title').first().text().trim() || undefined
  const description = $('meta[name="description"]').attr('content') || undefined
  const canonical = $('link[rel="canonical"]').attr('href') || undefined
  const locale = $('html').attr('lang') || $('meta[http-equiv="content-language"]').attr('content') || undefined
  const dir = $('html').attr('dir') || undefined
  const robotsMeta = $('meta[name="robots"]').attr('content') || undefined
  const keywords = ($('meta[name="keywords"]').attr('content') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const viewport = $('meta[name="viewport"]').attr('content') || undefined
  const charset = $('meta[charset]').attr('charset') || undefined
  const generator = $('meta[name="generator"]').attr('content') || undefined

  const og: Record<string, string> = {}
  $('meta[property^="og:"]').each((_, el) => {
    const p = $(el).attr('property')?.replace(/^og:/, '')
    const c = $(el).attr('content')
    if (p && c) og[p] = c
  })

  const twitter: Record<string, string> = {}
  $('meta[name^="twitter:"]').each((_, el) => {
    const n = $(el).attr('name')?.replace(/^twitter:/, '')
    const c = $(el).attr('content')
    if (n && c) twitter[n] = c
  })

  const hreflang: { lang: string; href: string }[] = []
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const lang = $(el).attr('hreflang')
    const href = $(el).attr('href')
    if (lang && href) hreflang.push({ lang, href })
  })

  const headings: { tag: string; text: string }[] = []
  for (const tag of ['h1', 'h2', 'h3', 'h4'] as const) {
    $(tag).each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim()
      if (text) headings.push({ tag, text })
    })
  }

  const links: { text: string; href: string; rel?: string }[] = []
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')!
    const text = $(el).text().replace(/\s+/g, ' ').trim()
    const rel = $(el).attr('rel') || undefined
    if (href && /^https?:|\//.test(href)) {
      links.push({ text, href, rel })
    }
  })
  // internal vs external counts (relative or same-origin heuristic uses base of the page URL)
  let internalLinks = 0
  let externalLinks = 0
  try {
    const base = new URL(url)
    for (const l of links) {
      const u = new URL(l.href, base)
      if (u.origin === base.origin) internalLinks++
      else externalLinks++
    }
  } catch {
    // ignore
  }

  const jsonLd: unknown[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    const txt = $(el).contents().text()
    try {
      const data = JSON.parse(txt)
      jsonLd.push(data)
    } catch {
      // ignore invalid JSON-LD
    }
  })

  // Breadcrumb detection from JSON-LD
  const breadcrumbs: string[] = []
  for (const item of jsonLd) {
    try {
      const obj: any = item
      if (!obj) continue
      const arr = Array.isArray(obj) ? obj : [obj]
      for (const entry of arr) {
        const t = entry['@type']
        if ((Array.isArray(t) && t.includes('BreadcrumbList')) || t === 'BreadcrumbList') {
          const elements = entry.itemListElement || []
          for (const e of elements) {
            const name = e?.item?.name || e?.name
            if (name) breadcrumbs.push(String(name))
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // basic content snippet from main content containers
  const snippet =
    $('main').text().trim() ||
    $('[role="main"]').text().trim() ||
    $('article').text().trim() ||
    $('body').text().trim()
  const normalizedSnippet = snippet.replace(/\s+/g, ' ').trim().slice(0, 500)
  const wordCount = normalizedSnippet ? normalizedSnippet.split(/\s+/).length : 0

  // Images summary
  const images: { src: string; alt?: string }[] = []
  let missingAlt = 0
  $('img[src]').each((_, el) => {
    const src = $(el).attr('src') || ''
    const alt = $(el).attr('alt') || undefined
    if (!alt) missingAlt++
    if (src) images.push({ src, alt })
  })

  return {
    url,
    locale: locale || undefined,
    dir: dir || undefined,
    title,
    description,
    canonical,
    og: Object.keys(og).length ? og : undefined,
    twitter: Object.keys(twitter).length ? twitter : undefined,
    hreflang: hreflang.length ? hreflang : undefined,
    headings,
    links: links.slice(0, 50),
    internalLinks,
    externalLinks,
    jsonLd,
    wordCount,
    contentSnippet: normalizedSnippet || undefined,
    robotsMeta,
    meta: {
      keywords: keywords.length ? keywords : undefined,
      viewport: viewport || undefined,
      charset: charset || undefined,
      generator: generator || undefined,
    },
    images: images.slice(0, 30),
    imageCount: images.length,
    imagesMissingAlt: missingAlt,
    breadcrumbs: breadcrumbs.length ? breadcrumbs : undefined,
  }
}
