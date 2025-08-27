import { z } from 'zod'
import path from 'node:path'
import fs from 'node:fs/promises'

export const ConfigSchema = z.object({
  baseUrl: z.string().optional(),
  obeyRobots: z.boolean().default(true).optional(),
  maxPages: z.number().default(100).optional(),
  concurrency: z.number().default(5).optional(),
  network: z
    .object({
      delayMs: z.number().optional(),
      sitemap: z
        .object({
          concurrency: z.number().optional(),
          delayMs: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  params: z.record(z.array(z.string())).optional(),
  paramSamples: z.function().args(z.string()).returns(z.array(z.string())).optional(),
  routeParams: z.record(z.record(z.array(z.string()))).optional(),
  routes: z.array(z.string()).optional(),
  buildScan: z
    .object({
      dirs: z.array(z.string()).optional(),
    })
    .optional(),
  robots: z
    .object({
      allowAll: z.boolean().optional(),
      llmAllow: z.boolean().optional(),
      llmBots: z.array(z.string()).optional(),
      searchAllow: z.boolean().optional(),
      searchBots: z.array(z.string()).optional(),
      sitemaps: z.array(z.string()).optional(),
      outFile: z.string().optional(),
    })
    .optional(),
  render: z
    .object({
      // Optional custom markdown renderer (only in TS/JS config files)
      markdown: z.function().args(z.any(), z.any()).returns(z.string()).optional(),
      theme: z.enum(['default', 'compact', 'detailed', 'structured']).optional(),
      structured: z
        .object({
          limits: z
            .object({
              headings: z.number().optional(),
              links: z.number().optional(),
              images: z.number().optional(),
            })
            .optional(),
          categories: z
            .object({
              order: z.array(z.string()).optional(),
              keywords: z.record(z.array(z.string())).optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
  output: z
    .object({
      file: z.string().default('llms.txt').optional(),
      format: z.enum(['markdown', 'json']).default('markdown').optional(),
    })
    .default({ file: 'llms.txt', format: 'markdown' })
    .optional(),
})

export type LLMOptimizerConfig = z.infer<typeof ConfigSchema>

export function defineConfig(cfg: LLMOptimizerConfig) {
  return cfg
}

export async function loadConfig(cwd = process.cwd()): Promise<LLMOptimizerConfig> {
  const candidates = [
    'llmoptimizer.config.ts',
    'llmoptimizer.config.mjs',
    'llmoptimizer.config.cjs',
    'llmoptimizer.config.js',
    '.llmoptimizerrc',
    '.llmoptimizerrc.json',
  ].map((p) => path.join(cwd, p))

  for (const file of candidates) {
    try {
      const stat = await fs.stat(file)
      if (!stat.isFile()) continue
      if (file.endsWith('.json') || file.endsWith('.rc') || file.endsWith('.llmoptimizerrc')) {
        const raw = JSON.parse(await fs.readFile(file, 'utf8'))
        return ConfigSchema.parse(raw)
      }
      // For ESM configs, use dynamic import
      const mod = await import(pathToFileUrl(file))
      const cfg = mod.default ?? mod.config ?? mod
      return ConfigSchema.parse(cfg)
    } catch {
      // ignore and continue
    }
  }
  return ConfigSchema.parse({})
}

function pathToFileUrl(p: string) {
  let pathName = path.resolve(p).replace(/\\/g, '/')
  if (pathName[0] !== '/') {
    pathName = '/' + pathName
  }
  return new URL('file://' + pathName).href
}
