// Avoid requiring Vite types at build time
type VitePlugin = {
  name: string
  apply?: 'build' | 'serve'
  configResolved?: (cfg: { build: { outDir?: string } }) => void
  closeBundle?: () => void | Promise<void>
}
import path from 'node:path'
import fs from 'node:fs/promises'
import { generateFromStatic, generateFromUrl } from '../lib/generate'
import { generateRobotsTxt, type RobotsOptions } from '../lib/robots'

export interface LLMOptimizerViteOptions {
  mode?: 'static' | 'crawl'
  baseUrl?: string
  outFile?: string
  format?: 'markdown' | 'json'
  obeyRobots?: boolean
  concurrency?: number
  requestDelayMs?: number
  include?: string[]
  exclude?: string[]
  theme?: 'default' | 'compact' | 'detailed'
  robots?: boolean | (RobotsOptions & { outFile?: string })
}

export function llmOptimizer(opts: LLMOptimizerViteOptions = {}): VitePlugin {
  let outDir = 'dist'
  return {
    name: 'llmoptimizer',
    apply: 'build',
    configResolved(cfg: { build: { outDir?: string } }) {
      outDir = cfg.build.outDir || outDir
    },
    async closeBundle() {
      const outFile = opts.outFile ?? `${outDir}/llms.txt`
      const format = opts.format ?? 'markdown'
      if ((opts.mode ?? 'static') === 'static') {
        await generateFromStatic({
          rootDir: outDir,
          outFile,
          format,
          include: opts.include,
          exclude: opts.exclude,
          theme: opts.theme,
        })
      } else {
        if (!opts.baseUrl) throw new Error('llmoptimizer vite plugin requires baseUrl in crawl mode')
        await generateFromUrl({
          baseUrl: opts.baseUrl,
          outFile,
          format,
          maxPages: 200,
          concurrency: opts.concurrency ?? 8,
          obeyRobots: opts.obeyRobots ?? true,
          include: opts.include,
          exclude: opts.exclude,
          requestDelayMs: opts.requestDelayMs,
        })
      }
      // eslint-disable-next-line no-console
      console.log(`[llmoptimizer] Wrote ${outFile}`)

      // Optionally write robots.txt alongside the build
      if (opts.robots) {
        const robotsOpts: RobotsOptions & { outFile?: string } = typeof opts.robots === 'boolean' ? {} : opts.robots
        const robotsFile = robotsOpts.outFile ?? path.join(outDir, 'robots.txt')
        // Try to auto-include sitemap.xml if present in outDir or baseUrl is provided
        const sitemaps: string[] = []
        try {
          const smLocal = path.join(outDir, 'sitemap.xml')
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
        console.log(`[llmoptimizer] Wrote ${robotsFile}`)
      }
    },
  }
}
