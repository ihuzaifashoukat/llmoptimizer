// Lightweight Astro integration to write llms.txt after build
// Usage in astro.config.mjs:
//   import llm from 'llmoptimizer/astro'
//   export default defineConfig({ integrations: [llm({ mode: 'static' })] })

import { fileURLToPath } from 'node:url'
import { generateFromStatic, generateFromUrl } from '../lib/generate'

export interface AstroOptions {
  mode?: 'static' | 'crawl'
  outFile?: string
  baseUrl?: string
  format?: 'markdown' | 'json'
  obeyRobots?: boolean
  concurrency?: number
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
        if (mode === 'static') {
          await generateFromStatic({ rootDir, outFile, format })
        } else {
          if (!opts.baseUrl) throw new Error('llmoptimizer astro integration requires baseUrl in crawl mode')
          await generateFromUrl({
            baseUrl: opts.baseUrl,
            outFile,
            format,
            maxPages: 200,
            concurrency: opts.concurrency ?? 8,
            obeyRobots: opts.obeyRobots ?? true,
          })
        }
        // eslint-disable-next-line no-console
        console.log(`[llmoptimizer][astro] wrote ${outFile}`)
      },
    },
  }
}
