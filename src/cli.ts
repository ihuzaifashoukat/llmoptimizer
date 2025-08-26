#!/usr/bin/env node
import { Command } from 'commander'
import { generate, generateFromSitemap, generateFromStatic, generateFromUrl } from './lib/generate'
import { loadConfig } from './lib/config'
import path from 'node:path'
import fs from 'node:fs/promises'

const program = new Command()
  .name('llmoptimizer')
  .description('Generate llm.txt summaries for websites (framework-agnostic).')
  .version('0.1.0')

program
  .command('generate')
  .description('Generate llm.txt from a URL, sitemap, or static directory')
  .option('-u, --url <url>', 'Root URL to crawl (respecting robots)')
  .option('-s, --sitemap <url>', 'Sitemap URL to seed URLs')
  .option('-r, --root <dir>', 'Static output directory with HTML files')
  .option('-o, --out <file>', 'Output file path', 'llm.txt')
  .option('-f, --format <fmt>', 'Output format: markdown|json', 'markdown')
  .option('--max-pages <n>', 'Max pages to include (default 100)', '100')
  .option('--concurrency <n>', 'Concurrent fetches (default 5)', '5')
  .option('--include <glob...>', 'Include URL patterns or file globs')
  .option('--exclude <glob...>', 'Exclude URL patterns or file globs')
  .option('--no-robots', 'Do not fetch/obey robots.txt when crawling URLs')
  .option('--adapter', 'Use framework adapter to infer routes')
  .option('--project-root <dir>', 'Project root for adapter detection', '.')
  .option('--template <file>', 'Path to a JS/TS module exporting a markdown(site,pages) function')
  .option('--params <file>', 'JSON file mapping param name to an array of sample values')
  .option('--route-params <file>', 'JSON file mapping route pattern to param values (e.g., {"/blog/:slug": {"slug": ["a","b"]}})')
  .option('--routes <pattern...>', 'Explicit route patterns to include (e.g., /blog/:slug /docs/:lang/getting-started)')
  .option('--build-scan', 'Scan common build output folders for HTML (no crawling)')
  .option('--build-dirs <dir...>', 'Directories to scan for HTML (relative to project root)')
  .option('--theme <name>', 'Markdown theme: default|compact|detailed', 'default')
  .action(async (opts) => {
    const cfg = await loadConfig()
    const maxPages = Number(opts.maxPages ?? cfg.maxPages ?? 100)
    const concurrency = Number(opts.concurrency ?? cfg.concurrency ?? 5)
    const format = (opts.format ?? cfg.output?.format ?? 'markdown') as 'markdown' | 'json'
    const theme = (opts.theme ?? cfg.render?.theme ?? 'default') as 'default' | 'compact' | 'detailed'
    let toMarkdownFn: ((site: any, pages: any[]) => string) | undefined = cfg.render?.markdown as any
    if (opts.template) {
      const mod = await import(pathToFileUrl(opts.template))
      toMarkdownFn = (mod.default ?? mod.markdown) as any
    }

    let paramsMap: Record<string, string[]> | undefined = cfg.params
    let routeParamsMap: Record<string, Record<string, string[]>> | undefined = cfg.routeParams
    if (opts.params) {
      const json = JSON.parse(await fs.readFile(path.resolve(opts.params), 'utf8'))
      paramsMap = json
    }
    if (opts.routeParams) {
      const json = JSON.parse(await fs.readFile(path.resolve(opts.routeParams), 'utf8'))
      routeParamsMap = json
    }

    if (opts.root) {
      const result = await generateFromStatic({
        rootDir: opts.root,
        outFile: opts.out ?? cfg.output?.file ?? 'llm.txt',
        format,
        include: opts.include ?? cfg.include,
        exclude: opts.exclude ?? cfg.exclude,
        toMarkdownFn,
        theme,
      })
      console.log(`Generated ${result.outFile} with ${result.pages.length} pages.`)
      return
    }

    if (opts.buildScan) {
      const { generateFromBuild } = await import('./lib/generate')
      const result = await generateFromBuild({
        projectRoot: opts.projectRoot ?? process.cwd(),
        outFile: opts.out ?? cfg.output?.file ?? 'llm.txt',
        format,
        dirs: opts.buildDirs ?? cfg.buildScan?.dirs,
        toMarkdownFn,
        include: opts.include ?? cfg.include,
        exclude: opts.exclude ?? cfg.exclude,
        theme,
      })
      console.log(`Generated ${result.outFile} with ${result.pages.length} pages (build scan).`)
      return
    }

    if (opts.adapter) {
      const baseUrl = opts.url ?? cfg.baseUrl
      if (!baseUrl) {
        console.error('Adapter mode requires --url (base site URL).')
        process.exit(1)
      }
      const { generateFromAdapter } = await import('./lib/generate')
      const result = await generateFromAdapter({
        projectRoot: opts.projectRoot ?? process.cwd(),
        baseUrl,
        outFile: opts.out ?? cfg.output?.file ?? 'llm.txt',
        format,
        concurrency,
        obeyRobots: opts.robots ?? cfg.obeyRobots ?? true,
        include: opts.include ?? cfg.include,
        exclude: opts.exclude ?? cfg.exclude,
        toMarkdownFn,
        paramsMap,
        paramSamplesFn: cfg.paramSamples,
        routeParamsMap,
        explicitRoutes: opts.routes ?? cfg.routes,
        theme,
      })
      console.log(`Generated ${result.outFile} with ${result.pages.length} pages.`)
      return
    }

    if (opts.sitemap) {
      const result = await generateFromSitemap({
        sitemapUrl: opts.sitemap,
        baseUrl: opts.url ?? cfg.baseUrl,
        outFile: opts.out ?? cfg.output?.file ?? 'llm.txt',
        format,
        maxPages,
        concurrency,
        obeyRobots: opts.robots ?? cfg.obeyRobots ?? true,
        include: opts.include ?? cfg.include,
        exclude: opts.exclude ?? cfg.exclude,
        toMarkdownFn,
        theme,
      })
      console.log(`Generated ${result.outFile} with ${result.pages.length} pages.`)
      return
    }

    if (opts.url || (cfg.baseUrl && !opts.root)) {
      const result = await generateFromUrl({
        baseUrl: opts.url ?? cfg.baseUrl,
        outFile: opts.out ?? cfg.output?.file ?? 'llm.txt',
        format,
        maxPages,
        concurrency,
        obeyRobots: opts.robots ?? cfg.obeyRobots ?? true,
        include: opts.include ?? cfg.include,
        exclude: opts.exclude ?? cfg.exclude,
        toMarkdownFn,
        theme,
      })
      console.log(`Generated ${result.outFile} with ${result.pages.length} pages.`)
      return
    }

    console.error('Specify one of: --url, --sitemap, or --root')
    process.exit(1)
  })

program.parse()

function pathToFileUrl(p: string) {
  let pathName = path.resolve(p).replace(/\\/g, '/')
  if (pathName[0] !== '/') pathName = '/' + pathName
  return new URL('file://' + pathName).href
}
