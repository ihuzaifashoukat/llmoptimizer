import path from 'node:path'
import fs from 'node:fs/promises'
import { generateFromAdapter, generateFromStatic, generateFromUrl } from '../lib/generate'
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
  theme?: 'default' | 'compact' | 'detailed'
  concurrency?: number
  obeyRobots?: boolean
  requestDelayMs?: number
  robots?: boolean | (RobotsOptions & { outFile?: string })
}

// Simple helper to invoke after `next build` (and optional `next export`).
// Use it from a small script referenced by your package.json postbuild.
export async function runAfterNextBuild(opts: NextHelperOptions = {}) {
  const outFile = opts.outFile ?? 'public/llms.txt'
  const format = opts.format ?? 'markdown'
  const mode = opts.mode ?? (opts.staticDir ? 'static' : opts.baseUrl ? 'adapter' : 'static')
  if (mode === 'static') {
    const dir = opts.staticDir ?? '.next/export' // default if using `next export`
    const res = await generateFromStatic({
      rootDir: dir,
      outFile,
      format,
      include: opts.include,
      exclude: opts.exclude,
      theme: opts.theme,
    })
    await maybeWriteRobots(opts)
    return res
  }
  if (mode === 'adapter') {
    if (!opts.baseUrl) throw new Error('runAfterNextBuild requires baseUrl in adapter mode')
    const res = await generateFromAdapter({
      projectRoot: opts.projectRoot ?? process.cwd(),
      baseUrl: opts.baseUrl,
      outFile,
      format,
      concurrency: opts.concurrency ?? 8,
      obeyRobots: opts.obeyRobots ?? true,
      include: opts.include,
      exclude: opts.exclude,
    })
    await maybeWriteRobots(opts)
    return res
  }
  if (mode === 'crawl') {
    if (!opts.baseUrl) throw new Error('runAfterNextBuild requires baseUrl in crawl mode')
    const res = await generateFromUrl({
      baseUrl: opts.baseUrl,
      outFile,
      format,
      maxPages: 200,
      concurrency: opts.concurrency ?? 8,
      obeyRobots: opts.obeyRobots ?? true,
      requestDelayMs: opts.requestDelayMs,
      include: opts.include,
      exclude: opts.exclude,
    })
    await maybeWriteRobots(opts)
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
