import fs from 'node:fs/promises'
import path from 'node:path'
import { globby } from 'globby'
import { generateFromBuild, generateFromStatic, generateFromUrl, generateFromAdapter } from '../lib/generate'
import { docsLLMs } from './docs'

export interface AutoOptions {
  projectRoot?: string
  baseUrl?: string
  outFile?: string // for crawl/adapter/build
  outDir?: string // for docs outputs
  format?: 'markdown' | 'json'
  concurrency?: number
  obeyRobots?: boolean
  requestDelayMs?: number
  maxPages?: number
  log?: boolean
}

export type AutoResult = { mode: 'docs' | 'build' | 'adapter' | 'crawl'; outPath: string; pages?: number }

export async function autoPostbuild(opts: AutoOptions = {}): Promise<AutoResult> {
  const root = path.resolve(opts.projectRoot ?? process.cwd())
  const format = opts.format ?? 'markdown'
  const concurrency = opts.concurrency ?? 8
  const obeyRobots = opts.obeyRobots ?? true
  const baseUrl = opts.baseUrl

  // 1) Docs detection
  const docsDir = path.join(root, 'docs')
  const blogDir = path.join(root, 'blog')
  try {
    const files = await globby(['**/*.md', '**/*.mdx'], { cwd: docsDir, ignore: ['**/_*.md', '**/_*.mdx'] })
    if (files.length) {
      const outDir = opts.outDir ?? path.join(root, 'build')
      const plugin = docsLLMs({ docsDir: 'docs', includeBlog: await dirExists(blogDir), blogDir: 'blog' })
      if (!plugin.postBuild) throw new Error('docs integration missing postBuild hook')
      await plugin.postBuild({ outDir, siteConfig: { url: baseUrl, baseUrl: '/', title: undefined, tagline: undefined } })
      if (opts.log) console.log(`[llmoptimizer][auto] docs → ${path.join(outDir, 'llms.txt')}`)
      return { mode: 'docs', outPath: path.join(outDir, 'llms.txt') }
    }
  } catch {}

  // 2) Framework & build detection via package.json
  const pkg = await readPackageJson(root)
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }

  // Candidate build dirs per framework
  const cand: string[] = []
  if ('next' in deps) cand.push('.next/server/pages', '.next/server/app', 'out', 'public')
  if ('nuxt' in deps || 'nuxt3' in deps || '@nuxt/kit' in deps) cand.push('.output/public', 'dist', 'public')
  if ('vite' in deps) cand.push('dist')
  if ('astro' in deps) cand.push('dist')
  if ('gatsby' in deps) cand.push('public')
  if ('@angular/core' in deps || '@angular/cli' in deps) cand.push('dist')
  // Generic fallbacks
  cand.push('dist', 'build', 'out', 'public')

  let foundDir: string | undefined
  for (const dir of cand) {
    const abs = path.join(root, dir)
    if (await dirExists(abs)) {
      const htmls = await globby(['**/*.html'], { cwd: abs })
      if (htmls.length) { foundDir = abs; break }
    }
  }
  if (foundDir) {
    // If a single build directory clearly exists, use static scan there
    const outFile = opts.outFile ?? path.join(foundDir, 'llms.txt')
    const res = await generateFromStatic({ rootDir: foundDir, outFile, format })
    if (opts.log) console.log(`[llmoptimizer][auto] build (static) → ${res.outFile} (${res.pages.length})`)
    return { mode: 'build', outPath: res.outFile, pages: res.pages.length }
  }

  // 3) Adapter (if baseUrl provided and adapters can detect routes)
  if (baseUrl) {
    try {
      const { detectRoutes } = await import('../adapters')
      const detected = await detectRoutes(root)
      if (detected?.routes?.length) {
        const outFile = opts.outFile ?? path.join(root, 'llms.txt')
        const res = await generateFromAdapter({ projectRoot: root, baseUrl, outFile, format, concurrency, obeyRobots })
        if (opts.log) console.log(`[llmoptimizer][auto] adapter → ${res.outFile} (${res.pages.length})`)
        return { mode: 'adapter', outPath: res.outFile, pages: res.pages.length }
      }
    } catch {}

    // 4) Crawl fallback
    const outFile = opts.outFile ?? path.join(root, 'llms.txt')
    const res = await generateFromUrl({ baseUrl, outFile, format, maxPages: opts.maxPages ?? 200, concurrency, obeyRobots, requestDelayMs: opts.requestDelayMs })
    if (opts.log) console.log(`[llmoptimizer][auto] crawl → ${res.outFile} (${res.pages.length})`)
    return { mode: 'crawl', outPath: res.outFile, pages: res.pages.length }
  }

  // If nothing matched and no baseUrl provided, do a broad build scan
  const res = await generateFromBuild({ projectRoot: root, outFile: path.join(root, opts.outFile ?? 'llms.txt'), format })
  if (opts.log) console.log(`[llmoptimizer][auto] build-scan → ${res.outFile} (${res.pages.length})`)
  return { mode: 'build', outPath: res.outFile, pages: res.pages.length }
}

async function readPackageJson(root: string): Promise<any> {
  const file = path.join(root, 'package.json')
  try {
    const txt = await fs.readFile(file, 'utf8')
    return JSON.parse(txt)
  } catch {
    return {}
  }
}

async function dirExists(p: string) {
  try { const s = await fs.stat(p); return s.isDirectory() } catch { return false }
}
