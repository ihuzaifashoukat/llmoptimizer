import path from 'node:path'
import fs from 'node:fs/promises'
import { globby } from 'globby'

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

// Internal structures and helpers
type Doc = { absPath: string; relPath: string; url: string; title: string; description?: string; content: string }

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

async function inlineLocalPartials(raw: string, baseDir: string, cache: Map<string, string>): Promise<string> {
  // Find MDX import lines for local partials e.g., import Foo from './_foo.mdx'
  const importRegex = /^\s*import\s+([A-Za-z0-9_]+)\s+from\s+['"](\.\/[^'"\n]+)['"];?\s*$/gm
  const imports: { name: string; abs: string; content: string }[] = []
  let m: RegExpExecArray | null
  const replaced = raw.replace(importRegex, (line) => {
    const mm = /^\s*import\s+([A-Za-z0-9_]+)\s+from\s+['"](\.\/[^'"\n]+)['"];?\s*$/.exec(line)
    if (!mm) return ''
    const name = mm[1]
    const rel = mm[2]
    if (!/\/_[^/]+\.(md|mdx)$/i.test(rel)) return '' // only inline partial-like files
    const abs = path.resolve(baseDir, rel)
    imports.push({ name, abs, content: '' })
    return ''
  })
  for (const imp of imports) {
    if (!cache.has(imp.abs)) {
      try {
        let txt = await fs.readFile(imp.abs, 'utf8')
        // recursively inline nested partials
        txt = await inlineLocalPartials(txt, path.dirname(imp.abs), cache)
        cache.set(imp.abs, txt)
      } catch {
        cache.set(imp.abs, '')
      }
    }
    imp.content = cache.get(imp.abs) || ''
  }
  // Replace component usages with content
  let out = replaced
  for (const imp of imports) {
    const usageRe = new RegExp(`<${imp.name}\s*/>`, 'g')
    out = out.replace(usageRe, imp.content)
  }
  return out
}

function cleanContent(raw: string, opts: { excludeImports?: boolean; removeDuplicateHeadings?: boolean }): string {
  let s = raw
  if (opts.excludeImports) {
    s = s
      .replace(/^\s*import\s+[^\n]+\n/gm, '')
      .replace(/^\s*export\s+(const|let|var|default)\s+[^\n]*\n/gm, '')
  }
  if (opts.removeDuplicateHeadings) {
    const lines = s.split(/\r?\n/)
    const out: string[] = []
    let lastHeading: string | null = null
    for (const ln of lines) {
      const h = ln.match(/^\s*#\s+(.+)$/)
      if (h) {
        lastHeading = h[1].trim()
        out.push(ln)
        continue
      }
      if (lastHeading && ln.trim() === lastHeading) {
        // skip duplicate
        continue
      }
      out.push(ln)
      if (ln.trim()) lastHeading = null
    }
    s = out.join('\n')
  }
  return s
}

function extractFrontmatterAndTitle(s: string): { title: string; description?: string; content: string } {
  let title = ''
  let description: string | undefined
  let body = s
  const fm = s.match(/^---\n([\s\S]*?)\n---\n?/)
  if (fm) {
    body = s.slice(fm[0].length)
    const block = fm[1]
    const t = block.match(/^\s*title:\s*(.+)\s*$/m)
    const d = block.match(/^\s*description:\s*(.+)\s*$/m)
    if (t) title = stripQuotes(t[1].trim())
    if (d) description = stripQuotes(d[1].trim())
  }
  if (!title) {
    const h1 = body.match(/^\s*#\s+(.+)$/m)
    if (h1) title = h1[1].trim()
  }
  if (!title) title = 'Untitled'
  return { title, description, content: body.trim() }
}

function stripQuotes(s: string) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1)
  return s
}

function toUrlPath(abs: string, ctx: { root: string; docsDir: string; blogDir?: string; ignorePaths?: string[]; addPaths?: string[] }): string {
  const relFromRoot = path.relative(ctx.root, abs).replace(/\\/g, '/')
  let segs = relFromRoot.split('/')
  // Drop leading docsDir/blogDir segments
  const drops = [ctx.docsDir.replace(/\\/g, '/'), ctx.blogDir?.replace(/\\/g, '/')].filter(Boolean) as string[]
  if (drops.length) {
    while (drops.includes(segs[0])) segs.shift()
  }
  // Apply ignorePaths
  if (ctx.ignorePaths?.length) segs = segs.filter((s) => !ctx.ignorePaths!.includes(s))
  // Apply addPaths
  if (ctx.addPaths?.length) segs = [...ctx.addPaths!, ...segs]
  // Remove extension
  const last = segs.pop() || ''
  const base = last.replace(/\.(md|mdx)$/i, '')
  segs.push(base)
  return '/' + segs.filter(Boolean).join('/')
}

function toSiteUrl(cfg: { baseUrl?: string; url?: string }, slugPath: string): string {
  const base = (cfg.url ? cfg.url.replace(/\/$/, '') : '') + (cfg.baseUrl || '')
  return base ? base.replace(/\/$/, '') + slugPath : slugPath
}

function orderDocs(docs: Doc[], includeOrder: string[] | undefined, includeUnmatchedLast: boolean): Doc[] {
  if (!includeOrder || !includeOrder.length) return docs.slice()
  const matched: Doc[] = []
  const rest = new Set(docs)
  for (const pat of includeOrder) {
    const re = globToRegex(pat)
    for (const d of docs) {
      if (rest.has(d) && (re.test(d.relPath) || re.test(d.url))) {
        matched.push(d); rest.delete(d)
      }
    }
  }
  if (includeUnmatchedLast) matched.push(...Array.from(rest))
  return matched
}

function filterDocs(docs: Doc[], includePatterns: string[], ignorePatterns?: string[]): Doc[] {
  const inc = includePatterns.map(globToRegex)
  const ig = (ignorePatterns || []).map(globToRegex)
  return docs.filter((d) => inc.some((r) => r.test(d.relPath) || r.test(d.url))).filter((d) => !ig.some((r) => r.test(d.relPath) || r.test(d.url)))
}

function globToRegex(g: string): RegExp {
  const esc = g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '::DOUBLESTAR::').replace(/\*/g, '[^/]*').replace(/::DOUBLESTAR::/g, '.*')
  return new RegExp('^' + esc + '$')
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')
}

function headingsFrom(content: string): string[] {
  const lines = content.split(/\r?\n/)
  const hs: string[] = []
  for (const ln of lines) {
    const m = ln.match(/^\s*#{1,4}\s+(.+)$/)
    if (m) hs.push(m[1].trim())
  }
  return hs
}

function wordCount(content: string): number {
  const noCode = content.replace(/```[\s\S]*?```/g, ' ')
  const plain = noCode.replace(/[`*_>#\-\[\]\(\)!]/g, ' ')
  const words = plain.split(/\s+/).filter(Boolean)
  return words.length
}

function tokenEstimate(content: string): number {
  // Very rough token estimate (~1.3x words heuristic)
  const words = wordCount(content)
  return Math.max(0, Math.round(words * 1.3))
}

function renderLinksFile(ctx: { title: string; description?: string; version?: string; rootContent?: string; docs: Doc[]; linkMapper: (u: string) => string; sections?: Array<{ name: string; links: Array<{ title: string; url: string; notes?: string }> }>; optionalLinks?: Array<{ title: string; url: string; notes?: string }> }) {
  const lines: string[] = []
  lines.push(`# ${ctx.title}`)
  if (ctx.description) lines.push(`> ${ctx.description}`)
  if (ctx.version) lines.push('', `Version: ${ctx.version}`)
  if (ctx.rootContent) { lines.push('', ctx.rootContent.trim(), '') }
  if (ctx.sections && ctx.sections.length) {
    for (const sec of ctx.sections) {
      lines.push('', `## ${sec.name}`)
      for (const link of sec.links) {
        const url = ctx.linkMapper(link.url)
        const base = `- [${link.title}](${url})`
        lines.push(link.notes ? `${base}: ${link.notes}` : base)
      }
    }
  } else {
    // Fallback: single Docs section with all docs
    lines.push('', '## Docs')
    for (const d of ctx.docs) {
      const url = ctx.linkMapper(d.url)
      lines.push(`- [${d.title}](${url})`)
    }
  }
  if (ctx.optionalLinks && ctx.optionalLinks.length) {
    lines.push('', '## Optional')
    for (const link of ctx.optionalLinks) {
      const url = ctx.linkMapper(link.url)
      const base = `- [${link.title}](${url})`
      lines.push(link.notes ? `${base}: ${link.notes}` : base)
    }
  }
  lines.push('', 'Generated By: LLMOPTIMIZER BY Huzaifa Shoukat')
  return lines.join('\n') + '\n'
}

function autoSectionsFrom(docs: Doc[]): Array<{ name: string; links: Array<{ title: string; url: string; notes?: string }> }> | undefined {
  if (!docs.length) return undefined
  const groups: Record<string, { title: string; url: string }[]> = {
    'Getting Started': [],
    Guides: [],
    API: [],
    Tutorials: [],
    Reference: [],
    Docs: [],
  }
  for (const d of docs) {
    const p = d.relPath.toLowerCase()
    if (p.includes('getting-started') || p.includes('quick-start') || p.includes('quickstart')) groups['Getting Started'].push({ title: d.title, url: d.url })
    else if (p.includes('/guide') || p.includes('guides')) groups['Guides'].push({ title: d.title, url: d.url })
    else if (p.includes('/api') || p.includes('reference/api')) groups['API'].push({ title: d.title, url: d.url })
    else if (p.includes('tutorial')) groups['Tutorials'].push({ title: d.title, url: d.url })
    else if (p.includes('reference')) groups['Reference'].push({ title: d.title, url: d.url })
    else groups['Docs'].push({ title: d.title, url: d.url })
  }
  const sections = Object.entries(groups)
    .filter(([, links]) => links.length)
    .map(([name, links]) => ({ name, links }))
  return sections.length ? sections : undefined
}

function renderCtx(byUrl: Map<string, Doc>, urls: string[]): string {
  const lines: string[] = []
  for (const u of urls) {
    const d = byUrl.get(u)
    if (!d) continue
    lines.push(`# ${d.title}\n`)
    if (d.description) lines.push(`> ${d.description}\n`)
    lines.push(d.content.trim(), '')
  }
  return lines.join('\n')
}

function renderFullFile(ctx: { title: string; description?: string; version?: string; rootContent?: string; docs: Doc[] }) {
  const lines: string[] = []
  lines.push(`# ${ctx.title}`)
  if (ctx.description) lines.push(`> ${ctx.description}`)
  if (ctx.version) lines.push('', `Version: ${ctx.version}`)
  if (ctx.rootContent) { lines.push('', ctx.rootContent.trim(), '') }
  lines.push('')
  for (const d of ctx.docs) {
    lines.push(`\n# ${d.title}\n`)
    if (d.description) lines.push(`> ${d.description}\n`)
    lines.push(d.content, '')
  }
  lines.push('', 'Generated By: LLMOPTIMIZER BY Huzaifa Shoukat')
  return lines.join('\n') + '\n'
}

function fileNameForDoc(d: Doc): string {
  const base = slugify(d.title || 'doc') || 'doc'
  return base + '.md'
}

function uniqueFileName(name: string, used: Set<string>): string {
  if (!used.has(name)) { used.add(name); return name }
  const [base, ext] = name.split(/\.(?=[^.]+$)/)
  let i = 1
  while (used.has(`${base}-${i}.${ext}`)) i++
  const nn = `${base}-${i}.${ext}`
  used.add(nn)
  return nn
}

function asGeneratedDoc(d: Doc): string {
  const lines: string[] = []
  lines.push(`# ${d.title}`)
  if (d.description) lines.push(`\n> ${d.description}\n`)
  lines.push(d.content)
  return lines.join('\n') + '\n'
}
