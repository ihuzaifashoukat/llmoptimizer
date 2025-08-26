export type OutputFormat = 'markdown' | 'json'

export interface PageExtract {
  url: string
  locale?: string
  dir?: string
  lastModified?: string
  title?: string
  description?: string
  canonical?: string
  og?: Record<string, string>
  twitter?: Record<string, string>
  hreflang?: { lang: string; href: string }[]
  headings: { tag: string; text: string }[]
  links: { text: string; href: string; rel?: string }[]
  internalLinks?: number
  externalLinks?: number
  jsonLd: unknown[]
  wordCount: number
  contentSnippet?: string
  robotsMeta?: string
  meta?: { keywords?: string[]; viewport?: string; charset?: string; generator?: string }
  images?: { src: string; alt?: string }[]
  imageCount?: number
  imagesMissingAlt?: number
  breadcrumbs?: string[]
}

export interface SiteSummary {
  generatedAt: string
  baseUrl?: string
  pageCount: number
  locales?: string[]
}
