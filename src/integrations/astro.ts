// Lightweight Astro integration to write llms.txt after build
// Usage in astro.config.mjs:
//   import llm from 'llmoptimizer/astro'
//   export default defineConfig({ integrations: [llm({ mode: 'static' })] })

import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'
import { generateFromStatic, generateFromUrl, generateFromBuild } from '../lib/generate'
import { generateRobotsTxt, type RobotsOptions } from '../lib/robots'

export interface AstroOptions {
  mode?: 'static' | 'crawl'
  outFile?: string
  baseUrl?: string
  format?: 'markdown' | 'json'
  theme?: 'default' | 'compact' | 'detailed' | 'structured'
  obeyRobots?: boolean
  concurrency?: number
  robots?: boolean | (RobotsOptions & { outFile?: string })
}

export default function llmOptimizerAstro(opts: AstroOptions = {}): any {
  const mode = opts.mode ?? 'static'
  return {
    name: 'llmoptimizer',
    hooks: {
      'astro:build:done': async ({ dir }: { dir: URL }) => {
        const rootDir = fileURLToPath(dir)
      const outFile = opts.outFile ?? `${rootDir}/llms.txt`
        const format = opts.format ?? 'markdown'
        let res: { pages: any[]; outFile: string } | undefined
        if (mode === 'static') {
          if (opts.baseUrl) {
            // Prefer build scan with baseUrl mapping to produce absolute URLs and richer coverage
            const projectRoot = process.cwd()
            const rel = path.relative(projectRoot, rootDir)
            res = await generateFromBuild({
              projectRoot,
              outFile,
              format,
              dirs: [rel],
              baseUrl: opts.baseUrl,
              concurrency: opts.concurrency ?? 8,
              obeyRobots: opts.obeyRobots ?? true,
              log: true,
              theme: opts.theme,
            })
            if (res.pages.length === 0) {
              console.warn('[llmoptimizer][astro] Build-scan found 0 pages; falling back to crawl mode.')
              res = await generateFromUrl({ baseUrl: opts.baseUrl, outFile, format, maxPages: 200, concurrency: opts.concurrency ?? 8, obeyRobots: opts.obeyRobots ?? true, theme: opts.theme })
            }
          } else {
            res = await generateFromStatic({ rootDir, outFile, format, theme: opts.theme })
          }
        } else {
          if (!opts.baseUrl) throw new Error('llmoptimizer astro integration requires baseUrl in crawl mode')
          res = await generateFromUrl({
            baseUrl: opts.baseUrl,
            outFile,
            format,
            maxPages: 200,
            concurrency: opts.concurrency ?? 8,
            obeyRobots: opts.obeyRobots ?? true,
            theme: opts.theme,
          })
        }
        // eslint-disable-next-line no-console
        console.log(`[llmoptimizer][astro] wrote ${outFile}${res ? ` (${res.pages.length} pages)` : ''}`)

        // Optionally write robots.txt alongside the build
        if (opts.robots) {
          const robotsOpts: RobotsOptions & { outFile?: string } = typeof opts.robots === 'boolean' ? {} : opts.robots
          const robotsFile = robotsOpts.outFile ?? path.join(rootDir, 'robots.txt')
          const sitemaps: string[] = []
          try {
            const smLocal = path.join(rootDir, 'sitemap.xml')
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
          console.log(`[llmoptimizer][astro] wrote ${robotsFile}`)
        }
      },
    },
  }
}
