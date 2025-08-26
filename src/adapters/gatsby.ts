import fs from 'node:fs/promises'
import path from 'node:path'
import { glob } from 'globby'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import type { AdapterContext, AdapterResult, FrameworkAdapter } from './index'

export const GatsbyAdapter: FrameworkAdapter = {
  name: 'gatsby',
  async detect(ctx: AdapterContext) {
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(ctx.projectRoot, 'package.json'), 'utf8'))
      return Boolean(pkg.dependencies?.gatsby || pkg.devDependencies?.gatsby)
    } catch { return false }
  },
  async routes(ctx: AdapterContext): Promise<AdapterResult> {
    const routes = new Set<string>()
    // 1) File-based routes in src/pages
    try {
      const files = await glob(['**/*.{js,jsx,ts,tsx,md,mdx}'], { cwd: path.join(ctx.projectRoot, 'src/pages') })
      for (const f of files) {
        const noExt = f.replace(/\.(jsx?|tsx?|mdx?)$/i, '')
        const parts = noExt.split('/')
        if (parts[parts.length - 1] === 'index') parts.pop()
        const route = '/' + parts.join('/')
        routes.add(route || '/')
      }
    } catch {}

    // 2) Best-effort parse gatsby-node.* for createPage({ path }) calls with string literals
    const nodeFiles = ['gatsby-node.ts', 'gatsby-node.js', 'gatsby-node.mjs', 'gatsby-node.cjs']
    for (const nf of nodeFiles) {
      try {
        const p = path.join(ctx.projectRoot, nf)
        const src = await fs.readFile(p, 'utf8')
        // match createPage({ path: '/some/path' }) or actions.createPage({ path: "/x" })
        const re = /createPage\s*\(\s*\{[^}]*path\s*:\s*(['"])(.*?)\1/gs
        let m: RegExpExecArray | null
        while ((m = re.exec(src))) {
          const r = m[2]
          if (r && r.startsWith('/')) routes.add(r)
        }
      } catch {}
    }

    // 3) Best-effort runtime execution of createPages to intercept actions.createPage calls
    try {
      const mod = await loadGatsbyNode(ctx.projectRoot)
      const createPages = mod && (mod.createPages || mod.default?.createPages || (typeof mod === 'function' ? mod : undefined))
      if (typeof createPages === 'function') {
        const captured = new Set<string>()
        const actions = {
          createPage: (args: any) => {
            const pth = args?.path
            if (typeof pth === 'string' && pth) captured.add(normalizeRoute(pth))
          },
        }
        const reporter = { info() {}, warn() {}, error() {}, panic() {} }
        const graphql = async () => ({ data: {}, errors: [] })
        const api = { actions, reporter, graphql }
        await withTimeout(Promise.resolve(createPages(api)), 1500)
        for (const r of captured) routes.add(r)
      }
    } catch {
      // ignore failures in sandboxed execution
    }

    return { routes: Array.from(routes), buildDirs: ['public'] }
  },
}

async function loadGatsbyNode(root: string): Promise<any> {
  const candidates = ['gatsby-node.js', 'gatsby-node.cjs', 'gatsby-node.mjs']
  for (const f of candidates) {
    const abs = path.join(root, f)
    try {
      const st = await fs.stat(abs)
      if (!st.isFile()) continue
      if (f.endsWith('.mjs')) {
        return import(pathToFileURL(abs).href)
      }
      const req = createRequire(abs)
      return req(abs)
    } catch {
      // continue
    }
  }
  // try TS only if a transpiled JS exists; otherwise skip
  return undefined
}

function normalizeRoute(r: string): string {
  if (!r.startsWith('/')) r = '/' + r
  return r.replace(/\/+$/, '') || '/'
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | void> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(undefined), ms)
    p.then((v) => { clearTimeout(t); resolve(v) }).catch(() => { clearTimeout(t); resolve(undefined) })
  })
}
