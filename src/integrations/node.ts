// Generic Node/React postbuild helper for any framework.
// Call from a small script in your repo after build.

import { generateFromStatic, generateFromUrl } from '../lib/generate'

export interface NodePostbuildOptions {
  mode?: 'static' | 'crawl'
  rootDir?: string
  baseUrl?: string
  outFile?: string
  format?: 'markdown' | 'json'
  concurrency?: number
  obeyRobots?: boolean
}

export async function runAfterBuild(opts: NodePostbuildOptions = {}) {
  const mode = opts.mode ?? (opts.rootDir ? 'static' : 'crawl')
  const outFile = opts.outFile ?? (opts.rootDir ? `${opts.rootDir}/llm.txt` : 'llm.txt')
  const format = opts.format ?? 'markdown'
  if (mode === 'static') {
    if (!opts.rootDir) throw new Error('runAfterBuild requires rootDir in static mode')
    return generateFromStatic({ rootDir: opts.rootDir, outFile, format })
  }
  if (!opts.baseUrl) throw new Error('runAfterBuild requires baseUrl in crawl mode')
  return generateFromUrl({
    baseUrl: opts.baseUrl,
    outFile,
    format,
    maxPages: 200,
    concurrency: opts.concurrency ?? 8,
    obeyRobots: opts.obeyRobots ?? true,
  })
}

