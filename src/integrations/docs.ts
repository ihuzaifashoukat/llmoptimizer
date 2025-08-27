import path from 'node:path'
import fs from 'node:fs/promises'
import { globby } from 'globby'
import {
  type Doc,
  inlineLocalPartials,
  cleanContent,
  extractFrontmatterAndTitle,
  toUrlPath,
  toSiteUrl,
  orderDocs,
  filterDocs,
  headingsFrom,
  wordCount,
  tokenEstimate,
  renderLinksFile,
  autoSectionsFrom,
  renderCtx,
  renderFullFile,
  uniqueFileName,
  fileNameForDoc,
  asGeneratedDoc,
} from './docs-helpers'

export interface CustomLLMFile {
  filename: string
  includePatterns: string[]
  fullContent: boolean
  title?: string
  description?: string
  ignorePatterns?: string[]
  orderPatterns?: string[]
  includeUnmatchedLast?: boolean
  version?: string
  rootContent?: string
}

export interface DocsLLMsOptions {
  // Generation toggles
  generateLLMsTxt?: boolean
  generateLLMsFullTxt?: boolean
  generateMarkdownFiles?: boolean

  // Directories
  docsDir?: string
  includeBlog?: boolean
  blogDir?: string

  // Filtering and ordering
  ignoreFiles?: string[]
  includeOrder?: string[]
  includeUnmatchedLast?: boolean

  // Path transformation
  pathTransformation?: {
    ignorePaths?: string[]
    addPaths?: string[]
  }

  // Cleaning
  excludeImports?: boolean
  removeDuplicateHeadings?: boolean

  // Metadata
  title?: string
  description?: string
  version?: string
  rootContent?: string
  fullRootContent?: string

  // Custom LLM files
  customLLMFiles?: CustomLLMFile[]

  // Filenames
  llmsTxtFilename?: string
  llmsFullTxtFilename?: string
  // Stats output
  statsOutFile?: string
  // Optional explicit sections for llms.txt file lists
  sections?: Array<{ name: string; links: Array<{ title: string; url: string; notes?: string }> }>
  optionalLinks?: Array<{ title: string; url: string; notes?: string }>
  // Auto section generation from docs tree when sections not provided
  autoSections?: boolean
  // Emit concatenated context files of linked content
  emitCtx?: boolean
  ctxOutFile?: string
  ctxFullOutFile?: string
}

type DocsPostBuildProps = {
  outDir: string
  siteConfig: { title?: string; tagline?: string; baseUrl?: string; url?: string }
}

type DocsPlugin = {
  name: string
  postBuild?: (props: DocsPostBuildProps) => void | Promise<void>
}

export function docsLLMs(options: DocsLLMsOptions = {}): DocsPlugin {
  const opts = withDefaults(options)
  return {
    name: 'llmoptimizer-docs',
    async postBuild(props) {
      const root = process.cwd()
      const docsDir = path.resolve(root, opts.docsDir)
      const blogDir = opts.includeBlog ? path.resolve(root, opts.blogDir) : undefined

      const allFiles: string[] = []
      const patterns = ['**/*.md', '**/*.mdx']
      const ig = ['**/_*.md', '**/_*.mdx', ...(opts.ignoreFiles || [])]
      const docsFiles = await globby(patterns, { cwd: docsDir, ignore: ig, absolute: true })
      allFiles.push(...docsFiles)
      if (blogDir) {
        const blogFiles = await globby(patterns, { cwd: blogDir, ignore: ig, absolute: true })
        allFiles.push(...blogFiles)
      }

      // Read and process documents
      const docs: Doc[] = []
      const importCache = new Map<string, string>()
      for (const abs of allFiles) {
        const rel = path.relative(root, abs)
        let raw = await fs.readFile(abs, 'utf8')
        // Inline partials for mdx imports of local _*.mdx
        raw = await inlineLocalPartials(raw, path.dirname(abs), importCache)
        const cleaned = cleanContent(raw, { excludeImports: opts.excludeImports, removeDuplicateHeadings: opts.removeDuplicateHeadings })
        const meta = extractFrontmatterAndTitle(cleaned)
        const slugPath = toUrlPath(abs, { root, docsDir, blogDir, ignorePaths: opts.pathTransformation.ignorePaths, addPaths: opts.pathTransformation.addPaths })
        const url = toSiteUrl(props.siteConfig, slugPath)
        docs.push({ absPath: abs, relPath: rel, url, title: meta.title, description: meta.description, content: meta.content })
      }

      // Order docs for base files
      const ordered = orderDocs(docs, opts.includeOrder, opts.includeUnmatchedLast)

      // Optionally write per-doc markdown files (cleaned)
      const mdMap = new Map<string, string>() // url -> generated filename
      if (opts.generateMarkdownFiles) {
        await fs.mkdir(props.outDir, { recursive: true })
        const used = new Set<string>()
        for (const d of ordered) {
          const fname = uniqueFileName(fileNameForDoc(d), used)
          const outFile = path.join(props.outDir, fname)
          await fs.writeFile(outFile, asGeneratedDoc(d))
          mdMap.set(d.url, '/' + fname)
        }
      }

      // Optionally compute sections when none provided
      const computedSections = !opts.sections ? autoSectionsFrom(ordered) : undefined

      // Build llms.txt (links)
      if (opts.generateLLMsTxt) {
        const txt = renderLinksFile({
          title: opts.title || props.siteConfig.title || 'Documentation',
          description: opts.description || props.siteConfig.tagline || 'LLM-friendly documentation index',
          version: opts.version,
          rootContent: opts.rootContent,
          docs: ordered,
          linkMapper: (u) => mdMap.get(u) || u,
          sections: opts.sections ?? computedSections,
          optionalLinks: opts.optionalLinks,
        })
        const out = path.join(props.outDir, opts.llmsTxtFilename)
        await fs.writeFile(out, txt)
      }

      // Build llms-full.txt (full content)
      if (opts.generateLLMsFullTxt) {
        const txt = renderFullFile({
          title: opts.title || props.siteConfig.title || 'Documentation',
          description: opts.description || props.siteConfig.tagline || 'LLM-friendly documentation',
          version: opts.version,
          rootContent: opts.fullRootContent,
          docs: ordered,
        })
        const out = path.join(props.outDir, opts.llmsFullTxtFilename)
        await fs.writeFile(out, txt)
      }

      // Custom LLM files
      if (opts.customLLMFiles?.length) {
        for (const cfg of opts.customLLMFiles) {
          const subset = filterDocs(docs, cfg.includePatterns, cfg.ignorePatterns)
          const ord = orderDocs(subset, cfg.orderPatterns, cfg.includeUnmatchedLast ?? false)
          const title = cfg.title || opts.title || props.siteConfig.title || 'Documentation'
          const description = cfg.description || opts.description || props.siteConfig.tagline || ''
          if (cfg.fullContent) {
            const txt = renderFullFile({ title, description, version: cfg.version ?? opts.version, rootContent: cfg.rootContent ?? opts.fullRootContent, docs: ord })
            await fs.writeFile(path.join(props.outDir, cfg.filename), txt)
          } else {
            const txt = renderLinksFile({ title, description, version: cfg.version ?? opts.version, rootContent: cfg.rootContent ?? opts.rootContent, docs: ord, linkMapper: (u) => mdMap.get(u) || u })
            await fs.writeFile(path.join(props.outDir, cfg.filename), txt)
          }
        }
      }

      // Stats JSON (includes rough token estimates)
      try {
        const perDoc = ordered.map((d) => ({
          url: d.url,
          title: d.title,
          headings: headingsFrom(d.content).length,
          words: wordCount(d.content),
          tokens: tokenEstimate(d.content),
        }))
        const totals = perDoc.reduce((acc, x) => ({ headings: acc.headings + x.headings, words: acc.words + x.words, tokens: acc.tokens + x.tokens }), { headings: 0, words: 0, tokens: 0 })
        const stats = { totalDocs: ordered.length, totals, perDoc }
        await fs.writeFile(path.join(props.outDir, opts.statsOutFile), JSON.stringify(stats, null, 2))
      } catch {}

      // Emit concatenated context files if requested
      if (opts.emitCtx) {
        const byUrl = new Map<string, Doc>()
        for (const d of ordered) byUrl.set(d.url, d)
        const sections = opts.sections ?? computedSections
        const coreLinks: string[] = sections
          ? sections.flatMap((s) => s.links.map((l) => l.url))
          : ordered.map((d) => d.url)
        const optionalLinks: string[] = (opts.optionalLinks || []).map((l) => l.url)
        const fullLinks: string[] = optionalLinks.length ? [...coreLinks, ...optionalLinks] : coreLinks
        const ctxCore = renderCtx(byUrl, coreLinks)
        const ctxFull = renderCtx(byUrl, fullLinks)
        await fs.writeFile(path.join(props.outDir, opts.ctxOutFile), ctxCore)
        await fs.writeFile(path.join(props.outDir, opts.ctxFullOutFile), ctxFull)
      }
    },
  }
}

type DocsResolvedOptions = {
  generateLLMsTxt: boolean
  generateLLMsFullTxt: boolean
  generateMarkdownFiles: boolean
  docsDir: string
  includeBlog: boolean
  blogDir: string
  ignoreFiles: string[]
  includeOrder: string[]
  includeUnmatchedLast: boolean
  pathTransformation: { ignorePaths: string[]; addPaths: string[] }
  excludeImports: boolean
  removeDuplicateHeadings: boolean
  title?: string
  description?: string
  version?: string
  rootContent?: string
  fullRootContent?: string
  customLLMFiles: CustomLLMFile[]
  llmsTxtFilename: string
  llmsFullTxtFilename: string
  statsOutFile: string
  sections?: Array<{ name: string; links: Array<{ title: string; url: string; notes?: string }> }>
  optionalLinks?: Array<{ title: string; url: string; notes?: string }>
  autoSections: boolean
  emitCtx: boolean
  ctxOutFile: string
  ctxFullOutFile: string
}

function withDefaults(o: DocsLLMsOptions): DocsResolvedOptions {
  return {
    generateLLMsTxt: o.generateLLMsTxt ?? true,
    generateLLMsFullTxt: o.generateLLMsFullTxt ?? true,
    generateMarkdownFiles: o.generateMarkdownFiles ?? false,
    docsDir: o.docsDir ?? 'docs',
    includeBlog: o.includeBlog ?? false,
    blogDir: o.blogDir ?? 'blog',
    ignoreFiles: o.ignoreFiles ?? [],
    includeOrder: o.includeOrder ?? [],
    includeUnmatchedLast: o.includeUnmatchedLast ?? true,
    pathTransformation: { ignorePaths: o.pathTransformation?.ignorePaths ?? [], addPaths: o.pathTransformation?.addPaths ?? [] },
    excludeImports: o.excludeImports ?? false,
    removeDuplicateHeadings: o.removeDuplicateHeadings ?? false,
    title: o.title,
    description: o.description,
    version: o.version,
    rootContent: o.rootContent,
    fullRootContent: o.fullRootContent,
    customLLMFiles: o.customLLMFiles ?? [],
    llmsTxtFilename: o.llmsTxtFilename ?? 'llms.txt',
    llmsFullTxtFilename: o.llmsFullTxtFilename ?? 'llms-full.txt',
    statsOutFile: o.statsOutFile ?? 'llms-stats.json',
    sections: o.sections,
    optionalLinks: o.optionalLinks,
    autoSections: o.autoSections ?? true,
    emitCtx: o.emitCtx ?? false,
    ctxOutFile: o.ctxOutFile ?? 'llms-ctx.txt',
    ctxFullOutFile: o.ctxFullOutFile ?? 'llms-ctx-full.txt',
  }
}

// helper functions moved to './docs-helpers'
