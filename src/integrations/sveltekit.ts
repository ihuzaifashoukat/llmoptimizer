// SvelteKit postbuild helper. Use from a small script after `vite build` / SvelteKit build.
// Example usage:
//   import { runAfterSvelteKitBuild } from 'llmoptimizer/sveltekit'
//   await runAfterSvelteKitBuild({ mode: 'static', baseUrl: 'https://your.app', buildDir: 'build' })

import path from 'node:path'
import fs from 'node:fs/promises'
import { generateFromBuild, generateFromStatic, generateFromUrl } from '../lib/generate'
import type { RobotsOptions } from '../lib/robots'
import { generateRobotsTxt } from '../lib/robots'

export interface SvelteKitOptions {
  mode?: 'static' | 'crawl'
  buildDir?: string // default: 'build'
  outFile?: string
  baseUrl?: string
  format?: 'markdown' | 'json'
  obeyRobots?: boolean
  concurrency?: number
  requestDelayMs?: number
  theme?: 'default' | 'compact' | 'detailed' | 'structured'
  include?: string[]
  exclude?: string[]
  renderOptions?: import('../lib/types').StructuredRenderOptions
  robots?: boolean | (RobotsOptions & { outFile?: string })
}

export async function runAfterSvelteKitBuild(opts: SvelteKitOptions = {}) {
  const mode = opts.mode ?? 'static'
  const buildDir = opts.buildDir ?? 'build'
  const outFile = opts.outFile ?? path.join(buildDir, 'llms.txt')
  const format = opts.format ?? 'markdown'
  let res: { pages: any[]; outFile: string } | undefined
  if (mode === 'static') {
    if (opts.baseUrl) {
      const projectRoot = process.cwd()
      const rel = path.relative(projectRoot, buildDir)
      res = await generateFromBuild({
        projectRoot,
        outFile,
        format,
        dirs: [rel],
        baseUrl: opts.baseUrl,
        concurrency: opts.concurrency ?? 8,
        obeyRobots: opts.obeyRobots ?? true,
        theme: opts.theme,
        include: opts.include,
        exclude: opts.exclude,
        renderOptions: opts.renderOptions,
        log: true,
      })
      if (res.pages.length === 0) {
        console.warn('[llmoptimizer][sveltekit] Build-scan found 0 pages; falling back to crawl mode.')
        res = await generateFromUrl({ baseUrl: opts.baseUrl, outFile, format, maxPages: 200, concurrency: opts.concurrency ?? 8, obeyRobots: opts.obeyRobots ?? true, requestDelayMs: opts.requestDelayMs, theme: opts.theme, include: opts.include, exclude: opts.exclude, renderOptions: opts.renderOptions })
      }
    } else {
      res = await generateFromStatic({ rootDir: buildDir, outFile, format, theme: opts.theme, include: opts.include, exclude: opts.exclude, renderOptions: opts.renderOptions })
    }
  } else {
    if (!opts.baseUrl) throw new Error('runAfterSvelteKitBuild requires baseUrl in crawl mode')
    res = await generateFromUrl({ baseUrl: opts.baseUrl, outFile, format, maxPages: 200, concurrency: opts.concurrency ?? 8, obeyRobots: opts.obeyRobots ?? true, requestDelayMs: opts.requestDelayMs, theme: opts.theme, include: opts.include, exclude: opts.exclude, renderOptions: opts.renderOptions })
  }
  // eslint-disable-next-line no-console
  console.log(`[llmoptimizer][sveltekit] wrote ${outFile}${res ? ` (${res.pages.length} pages)` : ''}`)

  if (opts.robots) {
    const robotsOpts: RobotsOptions & { outFile?: string } = typeof opts.robots === 'boolean' ? {} : opts.robots
    const robotsFile = robotsOpts.outFile ?? path.join(buildDir, 'robots.txt')
    const sitemaps: string[] = []
    try {
      const smLocal = path.join(buildDir, 'sitemap.xml')
      const st = await fs.stat(smLocal)
      if (st.isFile()) {
        if (opts.baseUrl) {
          const origin = new URL(opts.baseUrl).origin.replace(/\/$/, '')
          sitemaps.push(`${origin}/sitemap.xml`)
        } else {
          sitemaps.push('sitemap.xml')
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
    // eslint-disable-next-line no-console
    console.log(`[llmoptimizer][sveltekit] wrote ${robotsFile}`)
  }
  return res
}
