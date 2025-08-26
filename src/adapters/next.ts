import fs from 'node:fs/promises'
import path from 'node:path'
import { globby } from 'globby'
import type { AdapterContext, AdapterResult, FrameworkAdapter } from './index'

export const NextAdapter: FrameworkAdapter = {
  name: 'nextjs',
  async detect(ctx: AdapterContext) {
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(ctx.projectRoot, 'package.json'), 'utf8'))
      return Boolean(pkg.dependencies?.next || pkg.devDependencies?.next)
    } catch {
      return false
    }
  },
  async routes(ctx: AdapterContext): Promise<AdapterResult> {
    const roots = ['pages', 'src/pages', 'app', 'src/app']
    const routes = new Set<string>()
    for (const r of roots) {
      const dir = path.join(ctx.projectRoot, r)
      const files = await globby(['**/*.{tsx,ts,jsx,js,mdx,md}'], { cwd: dir, dot: false })
      for (const f of files) {
        // exclude api routes in pages/api and app/api
        if (/^api\//.test(f)) continue
        if (f.startsWith('_')) continue
        const withoutExt = f.replace(/\.(tsx|ts|jsx|js|mdx?|mjs|cjs)$/i, '')
        const parts = withoutExt.split(path.sep)
        // Next app dir uses page.tsx pattern
        if (parts[parts.length - 1] === 'page') parts.pop()
        // dynamic routes [id] -> :id
        const route = '/' + parts.map((p) => p.replace(/\[\[?\.\.\.(.+?)\]?\]/g, ':$1*').replace(/\[(.+?)\]/g, ':$1')).join('/')
        routes.add(route === '/index' ? '/' : route)
      }
    }
    return { routes: Array.from(routes), buildDirs: ['out', '.next/server/pages', '.next/server/app'] }
  },
  async discoverRouteParams(ctx: AdapterContext) {
    const slugSamples = new Set<string>(['welcome', 'hello-world'])
    try {
      const blogFiles = await globby(['content/blog/*.*', 'src/content/blog/*.*', 'pages/blog/*.*', 'src/pages/blog/*.*'], { cwd: ctx.projectRoot })
      for (const f of blogFiles) {
        const base = path.basename(f, path.extname(f))
        if (base && base !== 'index') slugSamples.add(base)
      }
    } catch {}
    const routeParams: Record<string, Record<string, string[]>> = {}
    // Offer samples for any route pattern containing :slug
    routeParams['/blog/:slug'] = { slug: Array.from(slugSamples) }
    return routeParams
  },
}
