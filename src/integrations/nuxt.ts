// Minimal Nuxt 3 module to generate llms.txt post build.
// Usage in nuxt.config.ts:
//   export default defineNuxtConfig({ modules: [['llmoptimizer/nuxt', { mode: 'static' }]] })

import { generateFromStatic, generateFromUrl } from '../lib/generate'

export interface NuxtOptions {
  mode?: 'static' | 'crawl'
  staticDir?: string // defaults to '.output/public' for nitro static
  outFile?: string
  baseUrl?: string
  format?: 'markdown' | 'json'
  obeyRobots?: boolean
  concurrency?: number
}

export default function llmoptimizerNuxt(options: NuxtOptions = {}) {
  return async function setup(_moduleContainer: any) {
    // Super-lazy dynamic import to avoid TS type resolution of '@nuxt/kit'
    const dynamicImport = (Function('m', 'return import(m)') as unknown as (m: string) => Promise<any>)
    let kit: any
    try { kit = await dynamicImport('@nuxt/kit') } catch { kit = null }
    if (!kit) {
      // eslint-disable-next-line no-console
      console.warn('[llmoptimizer][nuxt] @nuxt/kit not found; skipping llm generation hook')
      return
    }
    const nuxt = kit.useNuxt?.() || (globalThis as any).nuxt
    if (!nuxt?.hook) {
      // eslint-disable-next-line no-console
      console.warn('[llmoptimizer][nuxt] Could not access Nuxt instance; skipping hook')
      return
    }
    const mode = options.mode ?? 'static'
    nuxt.hook('nitro:build:done', async (nitro: any) => {
      const publicDir = options.staticDir || (nitro?.options?.output?.publicDir as string) || '.output/public'
      const outFile = options.outFile ?? `${publicDir}/llms.txt`
      const format = options.format ?? 'markdown'
      if (mode === 'static') {
        await generateFromStatic({ rootDir: publicDir, outFile, format })
      } else {
        if (!options.baseUrl) throw new Error('llmoptimizer nuxt module requires baseUrl in crawl mode')
        await generateFromUrl({
          baseUrl: options.baseUrl,
          outFile,
          format,
          maxPages: 200,
          concurrency: options.concurrency ?? 8,
          obeyRobots: options.obeyRobots ?? true,
        })
      }
      // eslint-disable-next-line no-console
      console.log(`[llmoptimizer][nuxt] wrote ${outFile}`)
    })
  }
}
