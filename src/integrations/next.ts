import path from 'node:path'
import fs from 'node:fs/promises'
import { generateFromAdapter, generateFromStatic, generateFromUrl, generateFromBuild } from '../lib/generate'
import { generateRobotsTxt, type RobotsOptions } from '../lib/robots'

export interface NextHelperOptions {
  projectRoot?: string
  baseUrl?: string
  outFile?: string
  format?: 'markdown' | 'json'
  mode?: 'static' | 'adapter' | 'crawl'
  staticDir?: string
  include?: string[]
  exclude?: string[]
  theme?: 'default' | 'compact' | 'detailed' | 'structured'
  concurrency?: number
  obeyRobots?: boolean
  requestDelayMs?: number
  robots?: boolean | (RobotsOptions & { outFile?: string })
  log?: boolean
}

// Simple helper to invoke after `next build` (and optional `next export`).
// Use it from a small script referenced by your package.json postbuild.
export async function runAfterNextBuild(opts: NextHelperOptions = {}) {
  const projectRoot = opts.projectRoot ?? process.cwd()
  const outFile = opts.outFile ?? path.join('public', 'llms.txt')
  const format = opts.format ?? 'markdown'
  const log = (msg: string) => { if (opts.log) console.log(`[llmoptimizer][next] ${msg}`) }

  // Try to infer baseUrl from common envs when not provided
  const inferredBase = inferBaseUrl(opts.baseUrl)
  const baseUrl = inferredBase

  // Decide starting mode
  const mode = opts.mode ?? (opts.staticDir ? 'static' : baseUrl ? 'adapter' : 'static')

  // 1) Try static/export scan first when in static mode
  if (mode === 'static') {
    // Prefer an explicit staticDir; otherwise test typical Next outputs
    const staticDir = opts.staticDir ?? '.next/export'
    let res = await generateFromStatic({
      rootDir: staticDir,
      outFile,
      format,
      include: opts.include,
      exclude: opts.exclude,
      theme: opts.theme,
    }).catch(() => ({ pages: [], outFile, site: { generatedAt: new Date().toISOString(), pageCount: 0 } } as any))
    if (res.pages.length === 0) {
      // 1b) Build scan common Next output dirs without requiring next export
      log('No HTML in export dir; attempting build scan.')
      const dirs = ['.next/server/pages', '.next/server/app', 'out', 'public']
      const resBuild = await generateFromBuild({
        projectRoot,
        outFile,
        format,
        dirs,
        include: opts.include,
        exclude: opts.exclude,
        toMarkdownFn: undefined,
        theme: opts.theme,
        baseUrl,
        concurrency: opts.concurrency ?? 8,
        obeyRobots: opts.obeyRobots ?? true,
        requestDelayMs: opts.requestDelayMs,
        maxPages: 200,
        log: true,
      }).catch(() => undefined)
      if (resBuild && resBuild.pages.length > 0) {
        await maybeWriteRobots({ ...opts, baseUrl })
        return resBuild
      }
      // 1c) If still empty and we have a baseUrl, try adapter then crawl
      if (baseUrl) {
        log('Build scan empty; attempting adapter mode.')
        const resAdapter = await generateFromAdapter({
          projectRoot,
          baseUrl,
          outFile,
          format,
          concurrency: opts.concurrency ?? 8,
          obeyRobots: opts.obeyRobots ?? true,
          include: opts.include,
          exclude: opts.exclude,
          toMarkdownFn: undefined,
          theme: opts.theme,
        }).catch(() => undefined)
        if (resAdapter && resAdapter.pages.length > 0) {
          await maybeWriteRobots({ ...opts, baseUrl })
          return resAdapter
        }
        log('Adapter empty or failed; attempting crawl mode.')
        const resCrawl = await generateFromUrl({
          baseUrl,
          outFile,
          format,
          maxPages: 200,
          concurrency: opts.concurrency ?? 8,
          obeyRobots: opts.obeyRobots ?? true,
          requestDelayMs: opts.requestDelayMs,
          include: opts.include,
          exclude: opts.exclude,
        })
        await maybeWriteRobots({ ...opts, baseUrl })
        return resCrawl
      }
    }
    await maybeWriteRobots({ ...opts, baseUrl })
    return res
  }

  // 2) Adapter mode (with fallback to crawl)
  if (mode === 'adapter') {
    if (!baseUrl) throw new Error('runAfterNextBuild requires baseUrl in adapter mode')
    let res = await generateFromAdapter({
      projectRoot,
      baseUrl,
      outFile,
      format,
      concurrency: opts.concurrency ?? 8,
      obeyRobots: opts.obeyRobots ?? true,
      include: opts.include,
      exclude: opts.exclude,
      theme: opts.theme,
    })
    if (res.pages.length === 0) {
      log('Adapter found 0 pages; attempting build-scan fallback.')
      try {
        const dirs = ['.next/server/pages', '.next/server/app', 'out', 'public']
        const resBuild = await generateFromBuild({
          projectRoot,
          outFile,
          format,
          dirs,
          include: opts.include,
          exclude: opts.exclude,
          toMarkdownFn: undefined,
          theme: opts.theme,
          baseUrl,
          concurrency: opts.concurrency ?? 8,
          obeyRobots: opts.obeyRobots ?? true,
          requestDelayMs: opts.requestDelayMs,
          maxPages: 200,
          log: true,
        })
        if (resBuild.pages.length > 0) {
          await maybeWriteRobots({ ...opts, baseUrl })
          return resBuild
        }
      } catch {}
      log('Build-scan fallback found 0 pages; falling back to crawl.')
      res = await generateFromUrl({
        baseUrl,
        outFile,
        format,
        maxPages: 200,
        concurrency: opts.concurrency ?? 8,
        obeyRobots: opts.obeyRobots ?? true,
        requestDelayMs: opts.requestDelayMs,
        include: opts.include,
        exclude: opts.exclude,
      })
    }
    await maybeWriteRobots({ ...opts, baseUrl })
    return res
  }

  // 3) Crawl mode
  if (mode === 'crawl') {
    if (!baseUrl) throw new Error('runAfterNextBuild requires baseUrl in crawl mode')
    const res = await generateFromUrl({
      baseUrl,
      outFile,
      format,
      maxPages: 200,
      concurrency: opts.concurrency ?? 8,
      obeyRobots: opts.obeyRobots ?? true,
      requestDelayMs: opts.requestDelayMs,
      include: opts.include,
      exclude: opts.exclude,
    })
    await maybeWriteRobots({ ...opts, baseUrl })
    return res
  }
}

async function maybeWriteRobots(opts: NextHelperOptions) {
  if (!opts.robots) return
  const robotsOpts: RobotsOptions & { outFile?: string } = typeof opts.robots === 'boolean' ? {} : opts.robots
  const robotsFile = robotsOpts.outFile ?? 'public/robots.txt'
  const sitemaps: string[] = []
  try {
    const smLocal = path.join(process.cwd(), 'public', 'sitemap.xml')
    const st = await fs.stat(smLocal)
    if (st.isFile()) sitemaps.push(opts.baseUrl ? `${new URL(opts.baseUrl).origin.replace(/\/$/, '')}/sitemap.xml` : '/sitemap.xml')
  } catch {}
  const txt = generateRobotsTxt({
    allowAll: robotsOpts.allowAll ?? true,
    llmAllow: robotsOpts.llmAllow ?? true,
    llmBots: robotsOpts.llmBots,
    searchAllow: robotsOpts.searchAllow ?? true,
    searchBots: robotsOpts.searchBots,
    sitemaps: robotsOpts.sitemaps ?? (sitemaps.length ? sitemaps : undefined),
  })
  await fs.mkdir(path.dirname(path.resolve(robotsFile)), { recursive: true })
  await fs.writeFile(robotsFile, txt)
}

function inferBaseUrl(explicit?: string): string | undefined {
  if (explicit) return explicit
  const env = process.env
  const site = env.NEXT_PUBLIC_SITE_URL || env.SITE_URL
  if (site) return site
  const vercel = env.VERCEL_URL // e.g. my-app.vercel.app
  if (vercel) return /^https?:\/\//.test(vercel) ? vercel : `https://${vercel}`
  return undefined
}
