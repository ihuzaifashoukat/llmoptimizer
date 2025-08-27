import fs from 'node:fs/promises'
import path from 'node:path'
import { globby } from 'globby'

export type NextRouteFile = {
  route: string
  file: string
  absPath: string
  type: 'page' | 'layout'
  source: 'pages' | 'app'
  dynamic?: boolean
  params?: string[]
  metadata?: {
    title?: string
    description?: string
    exports?: { default: boolean; named: string[] }
  }
}

export async function extractNextRoutes(projectRoot: string): Promise<{
  routes: NextRouteFile[]
  locales?: string[]
}> {
  const roots = [
    { dir: path.join(projectRoot, 'pages'), source: 'pages' as const },
    { dir: path.join(projectRoot, 'src', 'pages'), source: 'pages' as const },
    { dir: path.join(projectRoot, 'app'), source: 'app' as const },
    { dir: path.join(projectRoot, 'src', 'app'), source: 'app' as const },
  ]
  const out: NextRouteFile[] = []

  for (const root of roots) {
    try {
      const st = await fs.stat(root.dir)
      if (!st.isDirectory()) continue
    } catch { continue }

    if (root.source === 'pages') {
      const files = await globby(['**/*.{js,jsx,ts,tsx,md,mdx}'], { cwd: root.dir, dot: false })
      for (const rel of files) {
        // skip api, and any segment that starts with _
        if (/^(?:api\/|_)/.test(rel)) continue
        if (rel.split('/').some((seg) => seg.startsWith('_'))) continue
        const route = fileToPagesRoute(rel)
        const abs = path.join(root.dir, rel)
        const meta = await safeReadMeta(abs)
        const dyn = /\[.*?\]/.test(rel)
        const params = extractParamsFromPattern(route)
        out.push({ route, file: rel, absPath: abs, type: 'page', source: root.source, dynamic: dyn, params, metadata: meta })
      }
    } else {
      // app router: pages identified by **/page.*, layouts by **/layout.*
      const pages = await globby(['**/page.{js,jsx,ts,tsx,md,mdx}'], { cwd: root.dir, dot: false })
      const layouts = await globby(['**/layout.{js,jsx,ts,tsx}'], { cwd: root.dir, dot: false })
      for (const rel of pages) {
        if (/^(?:api\/)/.test(rel)) continue
        const route = appFileToRoute(rel)
        const abs = path.join(root.dir, rel)
        const meta = await safeReadMeta(abs)
        const dyn = /\[.*?\]/.test(rel)
        const params = extractParamsFromPattern(route)
        out.push({ route, file: rel, absPath: abs, type: 'page', source: root.source, dynamic: dyn, params, metadata: meta })
      }
      for (const rel of layouts) {
        const route = appFileToRoute(rel)
        const abs = path.join(root.dir, rel)
        const meta = await safeReadMeta(abs)
        out.push({ route, file: rel, absPath: abs, type: 'layout', source: root.source, dynamic: false, params: [], metadata: meta })
      }
    }
  }

  // Prefer app router pages if duplicates exist
  const byRoute = new Map<string, NextRouteFile>()
  for (const r of out) {
    const existing = byRoute.get(r.route)
    if (!existing) { byRoute.set(r.route, r); continue }
    if (existing.source === 'pages' && r.source === 'app' && r.type === 'page') {
      byRoute.set(r.route, r)
    }
  }

  const locales = await detectLocales(projectRoot)
  return { routes: Array.from(byRoute.values()), locales }
}

function fileToPagesRoute(filePath: string): string {
  // remove extension
  let p = filePath.replace(/\.(jsx?|tsx?|mdx?)$/i, '')
  // remove index suffix
  p = p.replace(/\/(?:index)$/i, '')
  // dynamic segments
  p = p.replace(/\[\[?\.\.\.(.+?)\]?\]/g, ':$1*').replace(/\[(.+?)\]/g, ':$1')
  // leading slash
  p = '/' + p.replace(/^\/+/, '')
  return p === '/index' || p === '/' ? '/' : p
}

function appFileToRoute(filePath: string): string {
  // dirname of page/layout
  let dir = path.dirname(filePath).replace(/\\/g, '/')
  if (dir === '.' || dir === '/') return '/'
  // strip route groups (group) and parallel routes @slot
  dir = dir
    .split('/')
    .filter((seg) => seg && !seg.startsWith('@'))
    .map((seg) => seg.replace(/\(.+?\)/g, ''))
    .filter(Boolean)
    .join('/')
  // strip intercepting routes (.), (..), (...)
  dir = dir.replace(/\(\.\.\.\)|\(\.\.\)|\(\.\)/g, '')
  // dynamic segments
  dir = dir.replace(/\[\[?\.\.\.(.+?)\]?\]/g, ':$1*').replace(/\[(.+?)\]/g, ':$1')
  const route = '/' + dir.replace(/\/+/, '')
  return route.replace(/\/+/, '/').replace(/\/$/, '') || '/'
}

function extractParamsFromPattern(route: string): string[] {
  const m = route.match(/:([A-Za-z0-9_]+)\*?/g)
  return m ? Array.from(new Set(m.map((s) => s.replace(/^:/, '').replace(/\*$/, '')))) : []
}

async function safeReadMeta(absPath: string) {
  try {
    const content = await fs.readFile(absPath, 'utf8')
    return extractMetadata(content)
  } catch { return undefined }
}

export function extractMetadata(content: string) {
  const metadata: NextRouteFile['metadata'] = {}
  // App router: export const metadata = { title, description }
  const metaBlock = content.match(/export\s+const\s+metadata\s*=\s*\{([\s\S]*?)\}/m)
  if (metaBlock) {
    const title = metaBlock[1].match(/title\s*:\s*(['\"][^'\"]+['\"])|title\s*:\s*`([^`]+)`/)
    const desc = metaBlock[1].match(/description\s*:\s*(['\"][^'\"]+['\"])|description\s*:\s*`([^`]+)`/)
    if (title) metadata.title = (title[2] || title[1] || '').replace(/^['\"]|['\"]$/g, '')
    if (desc) metadata.description = (desc[2] || desc[1] || '').replace(/^['\"]|['\"]$/g, '')
  } else {
    // Pages router simple heuristics
    const titleTag = content.match(/<title[^>]*>([^<]+)<\/title>/i)
    const titleProp = content.match(/title:\s*['\"]([^'\"]+)['\"]/)
    const descProp = content.match(/description:\s*['\"]([^'\"]+)['\"]/)
    if (titleTag) metadata.title = titleTag[1]
    else if (titleProp) metadata.title = titleProp[1]
    if (descProp) metadata.description = descProp[1]
  }
  const hasDefault = /export\s+default/.test(content)
  const named = Array.from(content.matchAll(/export\s+(?:const|function|class)\s+(\w+)/g)).map((m) => m[1])
  metadata.exports = { default: hasDefault, named }
  return metadata
}

async function detectLocales(projectRoot: string): Promise<string[] | undefined> {
  const locales = new Set<string>()
  // public/locales/*
  try {
    const dir = path.join(projectRoot, 'public', 'locales')
    const items = await fs.readdir(dir, { withFileTypes: true })
    for (const it of items) if (it.isDirectory()) locales.add(it.name)
  } catch {}
  // parse next.config.* for i18n.locales
  const cfgFiles = ['next.config.js', 'next.config.mjs', 'next.config.cjs', 'next.config.ts']
  for (const f of cfgFiles) {
    try {
      const src = await fs.readFile(path.join(projectRoot, f), 'utf8')
      const m = src.match(/i18n\s*:\s*\{[\s\S]*?locales\s*:\s*\[([^\]]+)\]/m)
      if (m) {
        const arr = m[1]
        const re = /['\"]([a-zA-Z0-9-]+)['\"]/g
        let mm: RegExpExecArray | null
        while ((mm = re.exec(arr))) locales.add(mm[1])
      }
    } catch {}
  }
  return locales.size ? Array.from(locales) : undefined
}
