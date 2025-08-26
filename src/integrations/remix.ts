// Remix build helper. Run after remix build or in CI.
// Usage: node scripts/postbuild-llm.mjs
//   import { runAfterRemixBuild } from 'llmoptimizer/remix'
//   await runAfterRemixBuild({ mode: 'crawl', baseUrl: 'https://your.app' })

import { generateFromStatic, generateFromUrl } from '../lib/generate'
import path from 'node:path'
import fs from 'node:fs/promises'

export interface RemixOptions {
  mode?: 'static' | 'crawl'
  buildDir?: string // If using a static export step
  outFile?: string
  baseUrl?: string
  format?: 'markdown' | 'json'
  obeyRobots?: boolean
  concurrency?: number
}

export async function runAfterRemixBuild(opts: RemixOptions = {}) {
  const mode = opts.mode ?? 'crawl'
  const format = opts.format ?? 'markdown'
  if (mode === 'static') {
    const dir = opts.buildDir ?? 'public'
    const outFile = opts.outFile ?? path.join(dir, 'llms.txt')
    // Ensure dir exists
    try { await fs.stat(dir) } catch { throw new Error(`Directory not found: ${dir}`) }
    return generateFromStatic({ rootDir: dir, outFile, format })
  }
  if (!opts.baseUrl) throw new Error('runAfterRemixBuild requires baseUrl in crawl mode')
  const outFile = opts.outFile ?? 'public/llms.txt'
  return generateFromUrl({ baseUrl: opts.baseUrl, outFile, format, maxPages: 200, concurrency: opts.concurrency ?? 8, obeyRobots: opts.obeyRobots ?? true })
}
