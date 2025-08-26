#!/usr/bin/env node
import { Command } from 'commander'
import { z } from 'zod'
import { generate, generateFromSitemap, generateFromStatic, generateFromUrl } from './lib/generate'
import { loadConfig } from './lib/config'
import path from 'node:path'
import fs from 'node:fs/promises'
import { generateRobotsTxt } from './lib/robots'

const program = new Command()
  .name('llmoptimizer')
  .description('Generate llms.txt summaries for websites (framework-agnostic).')
  .version('1.0.0')

program
  .command('generate')
  .description('Generate llms.txt from a URL, sitemap, or static directory')
  .option('-u, --url <url>', 'Root URL to crawl (respecting robots)')
  .option('-s, --sitemap <url>', 'Sitemap URL to seed URLs')
  .option('-r, --root <dir>', 'Static output directory with HTML files')
  .option('-o, --out <file>', 'Output file path', 'llms.txt')
  .option('-f, --format <fmt>', 'Output format: markdown|json', 'markdown')
  .option('--max-pages <n>', 'Max pages to include (default 100)', '100')
  .option('--concurrency <n>', 'Concurrent fetches (default 5)', '5')
  .option('--fetch-delay-ms <n>', 'Delay between HTTP requests in crawl/adapter (ms)')
  .option('--sitemap-concurrency <n>', 'Concurrent sitemap fetches (default 4)')
  .option('--sitemap-delay-ms <n>', 'Delay between sitemap fetches (ms)')
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
    const fetchDelayMs = opts.fetchDelayMs ? Number(opts.fetchDelayMs) : cfg.network?.delayMs
    const sitemapConcurrency = opts.sitemapConcurrency ? Number(opts.sitemapConcurrency) : cfg.network?.sitemap?.concurrency
    const sitemapDelayMs = opts.sitemapDelayMs ? Number(opts.sitemapDelayMs) : cfg.network?.sitemap?.delayMs
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
        outFile: opts.out ?? cfg.output?.file ?? 'llms.txt',
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
        outFile: opts.out ?? cfg.output?.file ?? 'llms.txt',
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
        outFile: opts.out ?? cfg.output?.file ?? 'llms.txt',
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
        outFile: opts.out ?? cfg.output?.file ?? 'llms.txt',
        format,
        maxPages,
        concurrency,
        obeyRobots: opts.robots ?? cfg.obeyRobots ?? true,
        include: opts.include ?? cfg.include,
        exclude: opts.exclude ?? cfg.exclude,
        toMarkdownFn,
        theme,
        sitemapConcurrency: sitemapConcurrency ?? 4,
        sitemapDelayMs: sitemapDelayMs ?? 0,
      })
      console.log(`Generated ${result.outFile} with ${result.pages.length} pages.`)
      return
    }

    if (opts.url || (cfg.baseUrl && !opts.root)) {
      const result = await generateFromUrl({
        baseUrl: opts.url ?? cfg.baseUrl,
        outFile: opts.out ?? cfg.output?.file ?? 'llms.txt',
        format,
        maxPages,
        concurrency,
        obeyRobots: opts.robots ?? cfg.obeyRobots ?? true,
        include: opts.include ?? cfg.include,
        exclude: opts.exclude ?? cfg.exclude,
        toMarkdownFn,
        theme,
        requestDelayMs: fetchDelayMs,
      })
      console.log(`Generated ${result.outFile} with ${result.pages.length} pages.`)
      return
    }

    console.error('Specify one of: --url, --sitemap, --root, --build-scan, or --adapter')
    process.exit(1)
  })

program
  .command('robots')
  .description('Generate robots.txt allowing popular LLM crawlers (and optionally set sitemaps)')
  .option('-o, --out <file>', 'Output file path', 'public/robots.txt')
  .option('--no-allow-all', 'Do not add a general Allow: / for all bots')
  .option('--no-llm-allow', 'Do not add explicit groups for LLM bots')
  .option('--no-search-allow', 'Do not add explicit groups for search engine bots')
  .option('--search-bot <name...>', 'Override list of search engine bots (space-separated)')
  .option('--sitemap <url...>', 'One or more Sitemap URLs')
  .action(async (opts) => {
    const cfg = await loadConfig()
    const outFile = opts.out ?? cfg.robots?.outFile ?? 'public/robots.txt'
    const txt = generateRobotsTxt({
      allowAll: opts.allowAll ?? cfg.robots?.allowAll ?? true,
      llmAllow: opts.llmAllow ?? cfg.robots?.llmAllow ?? true,
      llmBots: cfg.robots?.llmBots,
      searchAllow: opts.searchAllow ?? cfg.robots?.searchAllow ?? true,
      searchBots: (opts.searchBot as string[] | undefined) ?? cfg.robots?.searchBots,
      sitemaps: (opts.sitemap as string[] | undefined) ?? cfg.robots?.sitemaps,
    })
    await fs.mkdir(path.dirname(path.resolve(outFile)), { recursive: true })
    await fs.writeFile(outFile, txt)
    console.log(`Wrote ${outFile}`)
  })

program
  .command('docs')
  .description('Generate llms.txt and llms-full.txt from Markdown/MDX docs (no crawl) and optional stats')
  .option('--out-dir <dir>', 'Build output directory where files are written', 'build')
  .option('--site-url <url>', 'Site origin URL, e.g. https://example.com')
  .option('--base-url <path>', 'Base URL path, e.g. /docs')
  .option('--site-title <title>', 'Site title')
  .option('--site-tagline <tagline>', 'Site tagline/description')
  .option('--docs-dir <dir>', 'Directory containing docs', 'docs')
  .option('--include-blog', 'Include blog content (blogDir)', false)
  .option('--blog-dir <dir>', 'Blog directory', 'blog')
  .option('--ignore <glob...>', 'Ignore file globs (in addition to _*.mdx)')
  .option('--order <glob...>', 'Ordering patterns (rel paths or URLs)')
  .option('--no-unmatched-last', 'Do not include unmatched files last (strict ordering)')
  .option('--ignore-path <seg...>', 'Path segments to ignore when constructing URLs')
  .option('--add-path <seg...>', 'Path segments to prepend when constructing URLs')
  .option('--exclude-imports', 'Remove import/export lines from content')
  .option('--remove-duplicate-headings', 'Remove lines that duplicate the previous H1 text')
  .option('--generate-markdown-files', 'Emit cleaned per-doc markdown files in outDir and link to them from llms.txt')
  .option('--emit-ctx', 'Emit concatenated context files (llms-ctx.txt and llms-ctx-full.txt) from linked docs')
  .option('--ctx-out <file>', 'Filename for context file (core)', 'llms-ctx.txt')
  .option('--ctx-full-out <file>', 'Filename for context file (full including optional links)', 'llms-ctx-full.txt')
  .option('--no-auto-sections', 'Disable automatic section grouping when sections are not provided')
  .option('--llms-filename <name>', 'Filename for links file', 'llms.txt')
  .option('--llms-full-filename <name>', 'Filename for full content file', 'llms-full.txt')
  .option('--stats-file <name>', 'Filename for JSON stats', 'llms-stats.json')
  .option('--title <title>', 'Title to use in generated files')
  .option('--description <desc>', 'Description to use in generated files')
  .option('--version <v>', 'Version string to include')
  .option('--root-content-file <file>', 'Path to a file with additional root content for llms.txt')
  .option('--full-root-content-file <file>', 'Path to a file with additional root content for llms-full.txt')
  .option('--custom-llm-files <file>', 'JSON file describing additional custom LLM outputs')
  .option('--sections-file <file>', 'JSON file describing llms.txt sections')
  .option('--optional-links-file <file>', 'JSON file describing llms.txt optional links')
  .action(async (opts) => {
    const { docsLLMs } = await import('./integrations/docs')
    const rootContent = opts.rootContentFile ? await fs.readFile(path.resolve(opts.rootContentFile), 'utf8') : undefined
    const fullRootContent = opts.fullRootContentFile ? await fs.readFile(path.resolve(opts.fullRootContentFile), 'utf8') : undefined
    let customLLMFiles
    if (opts.customLlmFiles) {
      customLLMFiles = JSON.parse(await fs.readFile(path.resolve(opts.customLlmFiles), 'utf8'))
    }
    const LinkSchema = z.object({ title: z.string(), url: z.string().url().or(z.string()), notes: z.string().optional() })
    const SectionsSchema = z.array(z.object({ name: z.string(), links: z.array(LinkSchema) }))
    const LinksSchema = z.array(LinkSchema)
    let sections
    if (opts.sectionsFile) {
      const raw = JSON.parse(await fs.readFile(path.resolve(opts.sectionsFile), 'utf8'))
      sections = SectionsSchema.parse(raw)
    }
    let optionalLinks
    if (opts.optionalLinksFile) {
      const raw = JSON.parse(await fs.readFile(path.resolve(opts.optionalLinksFile), 'utf8'))
      optionalLinks = LinksSchema.parse(raw)
    }
    const plugin = docsLLMs({
      docsDir: opts.docsDir,
      includeBlog: Boolean(opts.includeBlog),
      blogDir: opts.blogDir,
      ignoreFiles: opts.ignore,
      includeOrder: opts.order,
      includeUnmatchedLast: opts.unmatchedLast ?? true,
      pathTransformation: { ignorePaths: opts.ignorePath, addPaths: opts.addPath },
      excludeImports: Boolean(opts.excludeImports),
      removeDuplicateHeadings: Boolean(opts.removeDuplicateHeadings),
      generateMarkdownFiles: Boolean(opts.generateMarkdownFiles),
      llmsTxtFilename: opts.llmsFilename,
      llmsFullTxtFilename: opts.llmsFullFilename,
      statsOutFile: opts.statsFile,
      autoSections: opts.autoSections ?? true,
      emitCtx: Boolean(opts.emitCtx),
      ctxOutFile: opts.ctxOut,
      ctxFullOutFile: opts.ctxFullOut,
      title: opts.title,
      description: opts.description,
      version: opts.version,
      rootContent,
      fullRootContent,
      customLLMFiles,
      sections,
      optionalLinks,
    })
    if (!plugin.postBuild) throw new Error('docs integration missing postBuild hook')
    await plugin.postBuild({
      outDir: opts.outDir,
      siteConfig: { url: opts.siteUrl, baseUrl: opts.baseUrl, title: opts.siteTitle, tagline: opts.siteTagline },
    })
    console.log(`Docs LLM files written to ${opts.outDir}`)
  })

program
  .command('auto')
  .description('Smart autodetect: docs -> build-scan -> adapter -> crawl')
  .option('--project-root <dir>', 'Project root for detection', '.')
  .option('--url <base>', 'Base site URL for adapter/crawl modes')
  .option('--out <file>', 'Output file for crawl/adapter/build modes', 'llms.txt')
  .option('--format <fmt>', 'Output format: markdown|json', 'markdown')
  .option('--concurrency <n>', 'Concurrent fetches', '8')
  .option('--no-robots', 'Do not obey robots in network modes')
  .option('--max-pages <n>', 'Max pages for crawl', '200')
  .option('--delay-ms <n>', 'Request delay for crawl/adapter (ms)', '0')
  // Docs options (subset)
  .option('--docs-dir <dir>', 'Docs directory', 'docs')
  .option('--include-blog', 'Include blog', false)
  .option('--blog-dir <dir>', 'Blog directory', 'blog')
  .option('--out-dir <dir>', 'Docs output directory', 'build')
  .action(async (opts) => {
    const root = path.resolve(opts.projectRoot ?? '.')
    // 1) Docs detection
    const { globby } = await import('globby')
    const docsDir = path.join(root, opts.docsDir ?? 'docs')
    try {
      const files = await globby(['**/*.md', '**/*.mdx'], { cwd: docsDir, ignore: ['**/_*.md', '**/_*.mdx'] })
      if (files.length) {
        const { docsLLMs } = await import('./integrations/docs')
        const plugin = docsLLMs({ docsDir: opts.docsDir, includeBlog: Boolean(opts.includeBlog), blogDir: opts.blogDir })
        if (!plugin.postBuild) throw new Error('docs integration missing postBuild hook')
        await plugin.postBuild({ outDir: opts.outDir ?? 'build', siteConfig: { url: opts.url, baseUrl: '/', title: undefined, tagline: undefined } })
        console.log(`Autodetect: docs mode → wrote ${opts.outDir}/llms.txt`)
        return
      }
    } catch {}

    // 2) Build-scan detection
    const buildDirs = ['dist', 'build', 'out', '.output/public', '.next/server/pages', '.next/server/app', 'public']
    const { globby: globby2 } = await import('globby')
    let foundHtml = false
    for (const dir of buildDirs) {
      try {
        const abs = path.join(root, dir)
        const files = await globby2(['**/*.html'], { cwd: abs })
        if (files.length) { foundHtml = true; break }
      } catch {}
    }
    if (foundHtml) {
      const { generateFromBuild } = await import('./lib/generate')
      const result = await generateFromBuild({ projectRoot: root, outFile: opts.out, format: opts.format })
      console.log(`Autodetect: build-scan mode → Generated ${result.outFile} (${result.pages.length} pages).`)
      return
    }

    // 3) Adapter if routes are detectable and url provided
    const baseUrl = opts.url
    if (baseUrl) {
      try {
        const { detectRoutes } = await import('./adapters')
        const detected = await detectRoutes(root)
        if (detected?.routes?.length) {
          const { generateFromAdapter } = await import('./lib/generate')
          const result = await generateFromAdapter({
            projectRoot: root,
            baseUrl,
            outFile: opts.out,
            format: opts.format,
            concurrency: Number(opts.concurrency ?? 8),
            obeyRobots: Boolean(opts.robots ?? true),
          })
          console.log(`Autodetect: adapter mode → Generated ${result.outFile} (${result.pages.length} pages).`)
          return
        }
      } catch {}
      // 4) Crawl fallback if url is provided
      const { generateFromUrl } = await import('./lib/generate')
      const result = await generateFromUrl({
        baseUrl,
        outFile: opts.out,
        format: opts.format,
        maxPages: Number(opts.maxPages ?? 200),
        concurrency: Number(opts.concurrency ?? 8),
        obeyRobots: Boolean(opts.robots ?? true),
        requestDelayMs: Number(opts.delayMs ?? 0),
      })
      console.log(`Autodetect: crawl mode → Generated ${result.outFile} (${result.pages.length} pages).`)
      return
    }

    console.error('Autodetect could not determine a mode. Provide --url for crawl/adapter or add docs/build output.')
    process.exit(1)
  })

program.parse()

function pathToFileUrl(p: string) {
  let pathName = path.resolve(p).replace(/\\/g, '/')
  if (pathName[0] !== '/') pathName = '/' + pathName
  return new URL('file://' + pathName).href
}
