// Nuxt 3 module to generate llms.txt post build and optionally robots.txt.
// Usage in nuxt.config.ts:
//   export default defineNuxtConfig({ modules: [["llmoptimizer/nuxt", { mode: 'static', robots: true }]] })

import path from 'node:path'
import fs from 'node:fs/promises'
import { generateFromStatic, generateFromUrl, generateFromBuild } from '../lib/generate'
import { generateRobotsTxt, type RobotsOptions } from '../lib/robots'

export interface NuxtOptions {
  mode?: 'static' | 'crawl'
  staticDir?: string // defaults to '.output/public' for nitro static
  outFile?: string
  baseUrl?: string
  format?: 'markdown' | 'json'
  theme?: 'default' | 'compact' | 'detailed' | 'structured'
  obeyRobots?: boolean
  concurrency?: number
  robots?: boolean | (RobotsOptions & { outFile?: string })
}

// Nuxt calls modules as a function with the Nuxt instance.
export default function llmoptimizerNuxt(options: NuxtOptions = {}) {
  return function setup(nuxt: any) {
    const mode = options.mode ?? 'static'
    nuxt.hook('nitro:build:done', async (nitro: any) => {
      const publicDir = options.staticDir || (nitro?.options?.output?.publicDir as string) || '.output/public'
      const outFile = options.outFile ?? `${publicDir}/llms.txt`
      const format = options.format ?? 'markdown'
      let res: { pages: any[]; outFile: string } | undefined
      if (mode === 'static') {
        if (options.baseUrl) {
          const projectRoot = process.cwd()
          const rel = path.relative(projectRoot, publicDir)
          res = await generateFromBuild({
            projectRoot,
            outFile,
            format,
            dirs: [rel],
            baseUrl: options.baseUrl,
            concurrency: options.concurrency ?? 8,
            obeyRobots: options.obeyRobots ?? true,
            theme: options.theme,
            log: true,
          })
          if (res.pages.length === 0) {
            console.warn('[llmoptimizer][nuxt] Build-scan found 0 pages; falling back to crawl mode.')
            res = await generateFromUrl({ baseUrl: options.baseUrl, outFile, format, maxPages: 200, concurrency: options.concurrency ?? 8, obeyRobots: options.obeyRobots ?? true, theme: options.theme })
          }
        } else {
          res = await generateFromStatic({ rootDir: publicDir, outFile, format, theme: options.theme })
        }
      } else {
        if (!options.baseUrl) throw new Error('llmoptimizer nuxt module requires baseUrl in crawl mode')
        res = await generateFromUrl({
          baseUrl: options.baseUrl,
          outFile,
          format,
          maxPages: 200,
          concurrency: options.concurrency ?? 8,
          obeyRobots: options.obeyRobots ?? true,
          theme: options.theme,
        })
      }
      // eslint-disable-next-line no-console
      console.log(`[llmoptimizer][nuxt] wrote ${outFile}${res ? ` (${res.pages.length} pages)` : ''}`)

      // Optionally write robots.txt in public dir
      if (options.robots) {
        const robotsOpts: RobotsOptions & { outFile?: string } = typeof options.robots === 'boolean' ? {} : options.robots
        const robotsFile = robotsOpts.outFile ?? path.join(publicDir, 'robots.txt')
        // Try to auto-include sitemap.xml if present in publicDir or baseUrl provided
        const sitemaps: string[] = []
        try {
          const smLocal = path.join(publicDir, 'sitemap.xml')
          const st = await fs.stat(smLocal)
          if (st.isFile()) {
            if (options.baseUrl) {
              const origin = new URL(options.baseUrl).origin.replace(/\/$/, '')
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
        console.log(`[llmoptimizer][nuxt] wrote ${robotsFile}`)
      }
    })
  }
}
