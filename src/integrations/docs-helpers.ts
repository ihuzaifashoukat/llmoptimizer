import path from 'node:path'
import fs from 'node:fs/promises'

export type Doc = { absPath: string; relPath: string; url: string; title: string; description?: string; content: string }

export async function inlineLocalPartials(raw: string, baseDir: string, cache: Map<string, string>): Promise<string> {
  const importRegex = /^\s*import\s+([A-Za-z0-9_]+)\s+from\s+['"](\.\/[^'"\n]+)['"];?\s*$/gm
  const imports: { name: string; abs: string; content: string }[] = []
  const replaced = raw.replace(importRegex, (line) => {
    const mm = /^\s*import\s+([A-Za-z0-9_]+)\s+from\s+['"](\.\/[^'"\n]+)['"];?\s*$/.exec(line)
    if (!mm) return ''
    const name = mm[1]
    const rel = mm[2]
    if (!/\/_[^/]+\.(md|mdx)$/i.test(rel)) return ''
    const abs = path.resolve(baseDir, rel)
    imports.push({ name, abs, content: '' })
    return ''
  })
  for (const imp of imports) {
    if (!cache.has(imp.abs)) {
      try {
        let txt = await fs.readFile(imp.abs, 'utf8')
        txt = await inlineLocalPartials(txt, path.dirname(imp.abs), cache)
        cache.set(imp.abs, txt)
      } catch {
        cache.set(imp.abs, '')
      }
    }
    imp.content = cache.get(imp.abs) || ''
  }
  let out = replaced
  for (const imp of imports) {
    const usageRe = new RegExp(`<${imp.name}\\s*/>`, 'g')
    out = out.replace(usageRe, imp.content)
  }
  return out
}

export function cleanContent(raw: string, opts: { excludeImports?: boolean; removeDuplicateHeadings?: boolean }): string {
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
      if (h) { lastHeading = h[1].trim(); out.push(ln); continue }
      if (lastHeading && ln.trim() === lastHeading) continue
      out.push(ln)
      if (ln.trim()) lastHeading = null
    }
    s = out.join('\n')
  }
  return s
}

export function extractFrontmatterAndTitle(s: string): { title: string; description?: string; content: string } {
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

export function stripQuotes(s: string) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1)
  return s
}

export function toUrlPath(abs: string, ctx: { root: string; docsDir: string; blogDir?: string; ignorePaths?: string[]; addPaths?: string[] }): string {
  const relFromRoot = path.relative(ctx.root, abs).replace(/\\/g, '/')
  let segs = relFromRoot.split('/')
  const drops = [ctx.docsDir.replace(/\\/g, '/'), ctx.blogDir?.replace(/\\/g, '/')].filter(Boolean) as string[]
  if (drops.length) { while (drops.includes(segs[0])) segs.shift() }
  if (ctx.ignorePaths?.length) segs = segs.filter((s) => !ctx.ignorePaths!.includes(s))
  if (ctx.addPaths?.length) segs = [...ctx.addPaths!, ...segs]
  const last = segs.pop() || ''
  const base = last.replace(/\.(md|mdx)$/i, '')
  segs.push(base)
  return '/' + segs.filter(Boolean).join('/')
}

export function toSiteUrl(cfg: { baseUrl?: string; url?: string }, slugPath: string): string {
  const base = (cfg.url ? cfg.url.replace(/\/$/, '') : '') + (cfg.baseUrl || '')
  return base ? base.replace(/\/$/, '') + slugPath : slugPath
}

export function globToRegex(g: string): RegExp {
  const esc = g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '::DOUBLESTAR::').replace(/\*/g, '[^/]*').replace(/::DOUBLESTAR::/g, '.*')
  return new RegExp('^' + esc + '$')
}

export function orderDocs(docs: Doc[], includeOrder: string[] | undefined, includeUnmatchedLast: boolean): Doc[] {
  if (!includeOrder || !includeOrder.length) return docs.slice()
  const matched: Doc[] = []
  const rest = new Set(docs)
  for (const pat of includeOrder) {
    const re = globToRegex(pat)
    for (const d of docs) {
      if (rest.has(d) && (re.test(d.relPath) || re.test(d.url))) { matched.push(d); rest.delete(d) }
    }
  }
  if (includeUnmatchedLast) matched.push(...Array.from(rest))
  return matched
}

export function filterDocs(docs: Doc[], includePatterns: string[], ignorePatterns?: string[]): Doc[] {
  const inc = includePatterns.map(globToRegex)
  const ig = (ignorePatterns || []).map(globToRegex)
  return docs.filter((d) => inc.some((r) => r.test(d.relPath) || r.test(d.url))).filter((d) => !ig.some((r) => r.test(d.relPath) || r.test(d.url)))
}

export function slugify(s: string): string { return s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-') }

export function headingsFrom(content: string): string[] {
  const lines = content.split(/\r?\n/)
  const hs: string[] = []
  for (const ln of lines) {
    const m = ln.match(/^\s*#{1,4}\s+(.+)$/)
    if (m) hs.push(m[1].trim())
  }
  return hs
}

export function wordCount(content: string): number {
  const noCode = content.replace(/```[\s\S]*?```/g, ' ')
  const plain = noCode.replace(/[`*_>#\-\[\]\(\)!]/g, ' ')
  const words = plain.split(/\s+/).filter(Boolean)
  return words.length
}

export function tokenEstimate(content: string): number { return Math.max(0, Math.round(wordCount(content) * 1.3)) }

export function renderLinksFile(ctx: { title: string; description?: string; version?: string; rootContent?: string; docs: Doc[]; linkMapper: (u: string) => string; sections?: Array<{ name: string; links: Array<{ title: string; url: string; notes?: string }> }>; optionalLinks?: Array<{ title: string; url: string; notes?: string }> }) {
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
    lines.push('', '## Docs')
    for (const d of ctx.docs) { const url = ctx.linkMapper(d.url); lines.push(`- [${d.title}](${url})`) }
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

export function autoSectionsFrom(docs: Doc[]): Array<{ name: string; links: Array<{ title: string; url: string; notes?: string }> }> | undefined {
  if (!docs.length) return undefined
  const groups: Record<string, { title: string; url: string }[]> = { 'Getting Started': [], Guides: [], API: [], Tutorials: [], Reference: [], Docs: [] }
  for (const d of docs) {
    const p = d.relPath.toLowerCase()
    if (p.includes('getting-started') || p.includes('quick-start') || p.includes('quickstart')) groups['Getting Started'].push({ title: d.title, url: d.url })
    else if (p.includes('/guide') || p.includes('guides')) groups['Guides'].push({ title: d.title, url: d.url })
    else if (p.includes('/api') || p.includes('reference/api')) groups['API'].push({ title: d.title, url: d.url })
    else if (p.includes('tutorial')) groups['Tutorials'].push({ title: d.title, url: d.url })
    else if (p.includes('reference')) groups['Reference'].push({ title: d.title, url: d.url })
    else groups['Docs'].push({ title: d.title, url: d.url })
  }
  const sections = Object.entries(groups).filter(([, links]) => links.length).map(([name, links]) => ({ name, links }))
  return sections.length ? sections : undefined
}

export function renderCtx(byUrl: Map<string, Doc>, urls: string[]): string {
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

export function renderFullFile(ctx: { title: string; description?: string; version?: string; rootContent?: string; docs: Doc[] }) {
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

export function fileNameForDoc(d: Doc): string { const base = slugify(d.title || 'doc') || 'doc'; return base + '.md' }

export function uniqueFileName(name: string, used: Set<string>): string {
  if (!used.has(name)) { used.add(name); return name }
  const [base, ext] = name.split(/\.(?=[^.]+$)/)
  let i = 1
  while (used.has(`${base}-${i}.${ext}`)) i++
  const nn = `${base}-${i}.${ext}`
  used.add(nn)
  return nn
}

export function asGeneratedDoc(d: Doc): string {
  const lines: string[] = []
  lines.push(`# ${d.title}`)
  if (d.description) lines.push(`\n> ${d.description}\n`)
  lines.push(d.content)
  return lines.join('\n') + '\n'
}

