import { globby } from 'globby'
import path from 'node:path'
import fs from 'node:fs/promises'
import type { AdapterContext, AdapterResult, FrameworkAdapter } from './index'

export const NuxtAdapter: FrameworkAdapter = {
  name: 'nuxt',
  async detect(ctx: AdapterContext) {
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(ctx.projectRoot, 'package.json'), 'utf8'))
      return Boolean(pkg.dependencies?.nuxt || pkg.devDependencies?.nuxt)
    } catch {
      return false
    }
  },
  async routes(ctx: AdapterContext): Promise<AdapterResult> {
    const roots = ['pages', 'src/pages']
    const routes = new Set<string>()
    for (const r of roots) {
      const dir = path.join(ctx.projectRoot, r)
      const files = await globby(['**/*.vue'], { cwd: dir, dot: false })
      for (const f of files) {
        const withoutExt = f.replace(/\.vue$/i, '')
        const parts = withoutExt.split(path.sep)
        if (parts[parts.length - 1] === 'index') parts.pop()
        const route = '/' + parts
          .map((p) => p
            .replace(/\[(\.\.\.)?(.+?)\]/g, (_m, dots, name) => (dots ? `:${name}*` : `:${name}`))
          ).join('/')
        routes.add(route || '/')
      }
    }
    return { routes: Array.from(routes), buildDirs: ['.output/public', 'dist'] }
  },
}
