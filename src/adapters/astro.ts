import { globby } from 'globby'
import path from 'node:path'
import fs from 'node:fs/promises'
import type { AdapterContext, AdapterResult, FrameworkAdapter } from './index'

export const AstroAdapter: FrameworkAdapter = {
  name: 'astro',
  async detect(ctx: AdapterContext) {
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(ctx.projectRoot, 'package.json'), 'utf8'))
      return Boolean(pkg.dependencies?.astro || pkg.devDependencies?.astro)
    } catch {
      return false
    }
  },
  async routes(ctx: AdapterContext): Promise<AdapterResult> {
    const roots = ['src/pages']
    const routes = new Set<string>()
    for (const r of roots) {
      const dir = path.join(ctx.projectRoot, r)
      const files = await globby(['**/*.{astro,md,mdx}'], { cwd: dir, dot: false })
      for (const f of files) {
        const withoutExt = f.replace(/\.(astro|mdx?|md)$/i, '')
        const parts = withoutExt.split(path.sep)
        // index handling
        if (parts[parts.length - 1] === 'index') parts.pop()
        const route = '/' + parts.map((p) => p.replace(/\[(\.\.\.)?(.+?)\]/g, (_m, dots, name) => (dots ? `:${name}*` : `:${name}`))).join('/')
        routes.add(route || '/')
      }
    }
    return { routes: Array.from(routes), buildDirs: ['dist'] }
  },
  async discoverRouteParams(ctx: AdapterContext) {
    const slugSamples = new Set<string>(['welcome', 'getting-started'])
    try {
      const blogFiles = await globby(['src/pages/blog/*.{md,mdx,astro}'], { cwd: ctx.projectRoot })
      for (const f of blogFiles) {
        const base = path.basename(f, path.extname(f))
        if (base && base !== 'index') slugSamples.add(base)
      }
    } catch {}
    return { '/blog/:slug': { slug: Array.from(slugSamples) } }
  },
}
