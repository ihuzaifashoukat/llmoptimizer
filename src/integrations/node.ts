// Generic Node/React postbuild helper for any framework.
// Call from a small script in your repo after build.

import path from 'node:path'
import fs from 'node:fs/promises'
import { generateFromStatic, generateFromUrl, generateFromBuild } from '../lib/generate'
import { generateRobotsTxt, type RobotsOptions } from '../lib/robots'

export interface NodePostbuildOptions {
  mode?: 'static' | 'crawl'
  rootDir?: string
  baseUrl?: string
  outFile?: string
  format?: 'markdown' | 'json'
  theme?: 'default' | 'compact' | 'detailed' | 'structured'
  concurrency?: number
  obeyRobots?: boolean
  robots?: boolean | (RobotsOptions & { outFile?: string })
}

export async function runAfterBuild(opts: NodePostbuildOptions = {}) {
  const mode = opts.mode ?? (opts.rootDir ? 'static' : 'crawl')
  const outFile = opts.outFile ?? (opts.rootDir ? `${opts.rootDir}/llms.txt` : 'llms.txt')
  const format = opts.format ?? 'markdown'
  if (mode === 'static') {
    if (!opts.rootDir) throw new Error('runAfterBuild requires rootDir in static mode')
    let res
    if (opts.baseUrl) {
      const projectRoot = process.cwd()
      const rel = path.relative(projectRoot, opts.rootDir)
      res = await generateFromBuild({ projectRoot, outFile, format, dirs: [rel], baseUrl: opts.baseUrl, concurrency: opts.concurrency ?? 8, obeyRobots: opts.obeyRobots ?? true, log: true, theme: opts.theme })
      if (res.pages.length === 0) {
        console.warn('[llmoptimizer][node] Build-scan found 0 pages; falling back to crawl mode.')
        res = await generateFromUrl({ baseUrl: opts.baseUrl, outFile, format, maxPages: 200, concurrency: opts.concurrency ?? 8, obeyRobots: opts.obeyRobots ?? true, theme: opts.theme })
      }
    } else {
      res = await generateFromStatic({ rootDir: opts.rootDir, outFile, format, theme: opts.theme })
    }
    await maybeWriteRobots(opts)
    return res
  }
  if (!opts.baseUrl) throw new Error('runAfterBuild requires baseUrl in crawl mode')
  const res = await generateFromUrl({
    baseUrl: opts.baseUrl,
    outFile,
    format,
    maxPages: 200,
    concurrency: opts.concurrency ?? 8,
    obeyRobots: opts.obeyRobots ?? true,
    theme: opts.theme,
  })
  await maybeWriteRobots(opts)
  return res
}

async function maybeWriteRobots(opts: NodePostbuildOptions) {
  if (!opts.robots) return
  const robotsOpts: RobotsOptions & { outFile?: string } = typeof opts.robots === 'boolean' ? {} : opts.robots
  const robotsFile = robotsOpts.outFile ?? (opts.rootDir ? path.join(opts.rootDir, 'robots.txt') : 'robots.txt')
  const sitemaps: string[] = []
  try {
    if (opts.rootDir) {
      const smLocal = path.join(opts.rootDir, 'sitemap.xml')
      const st = await fs.stat(smLocal)
      if (st.isFile()) {
        if (opts.baseUrl) {
          const origin = new URL(opts.baseUrl).origin.replace(/\/$/, '')
          sitemaps.push(`${origin}/sitemap.xml`)
        } else {
          sitemaps.push('sitemap.xml')
        }
      }
    }
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
