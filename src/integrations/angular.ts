// Angular postbuild helper (generic). Use after ng build.
// Example usage:
//   import { runAfterAngularBuild } from 'llmoptimizer/angular'
//   await runAfterAngularBuild({ distDir: 'dist/your-app', baseUrl: 'https://your.app' })

import path from 'node:path'
import fs from 'node:fs/promises'
import { generateFromBuild, generateFromStatic, generateFromUrl } from '../lib/generate'
import { generateRobotsTxt, type RobotsOptions } from '../lib/robots'

export interface AngularOptions {
  mode?: 'static' | 'crawl'
  distDir?: string
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

export async function runAfterAngularBuild(opts: AngularOptions = {}) {
  const mode = opts.mode ?? 'static'
  let distDir = opts.distDir
  if (!distDir) {
    // Try to autodetect from angular.json
    try {
      const root = process.cwd()
      const ajPath = path.join(root, 'angular.json')
      const aj = JSON.parse(await fs.readFile(ajPath, 'utf8'))
      const projectName: string = aj.defaultProject || Object.keys(aj.projects || {})[0]
      const proj = projectName ? aj.projects?.[projectName] : undefined
      const out = proj?.architect?.build?.options?.outputPath as string | undefined
      distDir = out || (projectName ? `dist/${projectName}/browser` : 'dist')
    } catch {
      distDir = 'dist'
    }
  }
  const outFile = opts.outFile ?? path.join(distDir, 'llms.txt')
  const format = opts.format ?? 'markdown'
  let res
  if (mode === 'static') {
    if (opts.baseUrl) {
      const projectRoot = process.cwd()
      const rel = path.relative(projectRoot, distDir)
      res = await generateFromBuild({ projectRoot, outFile, format, dirs: [rel], baseUrl: opts.baseUrl, concurrency: opts.concurrency ?? 8, obeyRobots: opts.obeyRobots ?? true, theme: opts.theme, include: opts.include, exclude: opts.exclude, renderOptions: opts.renderOptions, log: true })
      if (res.pages.length === 0) {
        console.warn('[llmoptimizer][angular] Build-scan found 0 pages; falling back to crawl mode.')
        res = await generateFromUrl({ baseUrl: opts.baseUrl, outFile, format, maxPages: 200, concurrency: opts.concurrency ?? 8, obeyRobots: opts.obeyRobots ?? true, requestDelayMs: opts.requestDelayMs, theme: opts.theme, include: opts.include, exclude: opts.exclude, renderOptions: opts.renderOptions })
      }
    } else {
      res = await generateFromStatic({ rootDir: distDir, outFile, format, theme: opts.theme, include: opts.include, exclude: opts.exclude, renderOptions: opts.renderOptions })
    }
  } else {
    if (!opts.baseUrl) throw new Error('runAfterAngularBuild requires baseUrl in crawl mode')
    res = await generateFromUrl({ baseUrl: opts.baseUrl, outFile, format, maxPages: 200, concurrency: opts.concurrency ?? 8, obeyRobots: opts.obeyRobots ?? true, requestDelayMs: opts.requestDelayMs, theme: opts.theme, include: opts.include, exclude: opts.exclude, renderOptions: opts.renderOptions })
  }
  // eslint-disable-next-line no-console
  console.log(`[llmoptimizer][angular] wrote ${outFile}${res ? ` (${res.pages.length} pages)` : ''}`)

  if (opts.robots) {
    const robotsOpts: RobotsOptions & { outFile?: string } = typeof opts.robots === 'boolean' ? {} : opts.robots
    const robotsFile = robotsOpts.outFile ?? path.join(distDir, 'robots.txt')
    const sitemaps: string[] = []
    try {
      const smLocal = path.join(distDir, 'sitemap.xml')
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
    console.log(`[llmoptimizer][angular] wrote ${robotsFile}`)
  }
  return res
}
