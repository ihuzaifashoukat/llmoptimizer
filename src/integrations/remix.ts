// Remix build helper. Run after remix build or in CI.
// Usage: node scripts/postbuild-llm.mjs
//   import { runAfterRemixBuild } from 'llmoptimizer/remix'
//   await runAfterRemixBuild({ mode: 'crawl', baseUrl: 'https://your.app' })

import { generateFromStatic, generateFromUrl, generateFromBuild } from '../lib/generate'
import { generateRobotsTxt, type RobotsOptions } from '../lib/robots'
import path from 'node:path'
import fs from 'node:fs/promises'

export interface RemixOptions {
  mode?: 'static' | 'crawl'
  buildDir?: string // If using a static export step
  outFile?: string
  baseUrl?: string
  format?: 'markdown' | 'json'
  theme?: 'default' | 'compact' | 'detailed' | 'structured'
  obeyRobots?: boolean
  concurrency?: number
  robots?: boolean | (RobotsOptions & { outFile?: string })
}

export async function runAfterRemixBuild(opts: RemixOptions = {}) {
  const mode = opts.mode ?? 'crawl'
  const format = opts.format ?? 'markdown'
  if (mode === 'static') {
    const dir = opts.buildDir ?? 'public'
    const outFile = opts.outFile ?? path.join(dir, 'llms.txt')
    try { await fs.stat(dir) } catch { throw new Error(`Directory not found: ${dir}`) }
    let res
    if (opts.baseUrl) {
      const projectRoot = process.cwd()
      const rel = path.relative(projectRoot, dir)
      res = await generateFromBuild({ projectRoot, outFile, format, dirs: [rel], baseUrl: opts.baseUrl, concurrency: opts.concurrency ?? 8, obeyRobots: opts.obeyRobots ?? true, log: true, theme: opts.theme })
      if (res.pages.length === 0) {
        console.warn('[llmoptimizer][remix] Build-scan found 0 pages; falling back to crawl mode.')
        res = await generateFromUrl({ baseUrl: opts.baseUrl, outFile, format, maxPages: 200, concurrency: opts.concurrency ?? 8, obeyRobots: opts.obeyRobots ?? true, theme: opts.theme })
      }
    } else {
      res = await generateFromStatic({ rootDir: dir, outFile, format, theme: opts.theme })
    }
    await maybeWriteRobots({ ...opts, buildDir: dir })
    return res
  }
  if (!opts.baseUrl) throw new Error('runAfterRemixBuild requires baseUrl in crawl mode')
  const outFile = opts.outFile ?? 'public/llms.txt'
  const res = await generateFromUrl({ baseUrl: opts.baseUrl, outFile, format, maxPages: 200, concurrency: opts.concurrency ?? 8, obeyRobots: opts.obeyRobots ?? true, theme: opts.theme })
  await maybeWriteRobots(opts)
  return res
}

async function maybeWriteRobots(opts: RemixOptions & { buildDir?: string }) {
  if (!opts.robots) return
  const robotsOpts: RobotsOptions & { outFile?: string } = typeof opts.robots === 'boolean' ? {} : opts.robots
  const robotsFile = robotsOpts.outFile ?? path.join(opts.buildDir ?? 'public', 'robots.txt')
  const sitemaps: string[] = []
  try {
    const dir = opts.buildDir ?? 'public'
    const smLocal = path.join(dir, 'sitemap.xml')
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
