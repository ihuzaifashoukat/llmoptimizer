import type { Plugin } from 'vite'
import { generateFromStatic, generateFromUrl } from '../lib/generate'

export interface LLMOptimizerViteOptions {
  mode?: 'static' | 'crawl'
  baseUrl?: string
  outFile?: string
  format?: 'markdown' | 'json'
  obeyRobots?: boolean
  concurrency?: number
}

export function llmOptimizer(opts: LLMOptimizerViteOptions = {}): Plugin {
  let outDir = 'dist'
  return {
    name: 'llmoptimizer',
    apply: 'build',
    configResolved(cfg) {
      outDir = cfg.build.outDir || outDir
    },
    async closeBundle() {
      const outFile = opts.outFile ?? `${outDir}/llm.txt`
      const format = opts.format ?? 'markdown'
      if ((opts.mode ?? 'static') === 'static') {
        await generateFromStatic({ rootDir: outDir, outFile, format })
      } else {
        if (!opts.baseUrl) throw new Error('llmoptimizer vite plugin requires baseUrl in crawl mode')
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
      console.log(`[llmoptimizer] Wrote ${outFile}`)
    },
  }
}

