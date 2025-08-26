import { generateFromAdapter, generateFromStatic, generateFromUrl } from '../lib/generate'

export interface NextHelperOptions {
  projectRoot?: string
  baseUrl?: string
  outFile?: string
  format?: 'markdown' | 'json'
  mode?: 'static' | 'adapter' | 'crawl'
  staticDir?: string
}

// Simple helper to invoke after `next build` (and optional `next export`).
// Use it from a small script referenced by your package.json postbuild.
export async function runAfterNextBuild(opts: NextHelperOptions = {}) {
  const outFile = opts.outFile ?? 'public/llm.txt'
  const format = opts.format ?? 'markdown'
  const mode = opts.mode ?? (opts.staticDir ? 'static' : opts.baseUrl ? 'adapter' : 'static')
  if (mode === 'static') {
    const dir = opts.staticDir ?? '.next/export' // default if using `next export`
    return generateFromStatic({ rootDir: dir, outFile, format })
  }
  if (mode === 'adapter') {
    if (!opts.baseUrl) throw new Error('runAfterNextBuild requires baseUrl in adapter mode')
    return generateFromAdapter({
      projectRoot: opts.projectRoot ?? process.cwd(),
      baseUrl: opts.baseUrl,
      outFile,
      format,
      concurrency: 8,
      obeyRobots: true,
    })
  }
  if (mode === 'crawl') {
    if (!opts.baseUrl) throw new Error('runAfterNextBuild requires baseUrl in crawl mode')
    return generateFromUrl({ baseUrl: opts.baseUrl, outFile, format, maxPages: 200, concurrency: 8, obeyRobots: true })
  }
}

