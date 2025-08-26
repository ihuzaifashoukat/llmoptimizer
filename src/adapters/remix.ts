import { globby } from 'globby'
import path from 'node:path'
import fs from 'node:fs/promises'
import type { AdapterContext, AdapterResult, FrameworkAdapter } from './index'

function remixFileToRoute(rel: string): string {
  // Based on Remix route conventions (simplified):
  // - app/routes
  // - dots in filename become path separators
  // - $param => :param
  // - _index => index route for the current path
  // - leading underscore on directory means pathless layout => ignore underscore
  // - handle index at end
  const withoutExt = rel.replace(/\.(tsx|ts|jsx|js|md|mdx)$/i, '')
  const withSlashes = withoutExt.replace(/\./g, '/')
  const parts = withSlashes.split(path.sep).map((seg) => seg.replace(/^_/, ''))
  // last segment special cases
  if (parts[parts.length - 1] === 'index' || parts[parts.length - 1] === '') parts.pop()
  const mapped = parts.map((p) => p.replace(/\$(\w+)/g, (_m, n) => `:${n}`))
  const route = '/' + mapped.filter(Boolean).join('/')
  return route || '/'
}

export const RemixAdapter: FrameworkAdapter = {
  name: 'remix',
  async detect(ctx: AdapterContext) {
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(ctx.projectRoot, 'package.json'), 'utf8'))
      return Boolean(
        pkg.dependencies?.['@remix-run/react'] ||
          pkg.devDependencies?.['@remix-run/react'] ||
          pkg.dependencies?.remix ||
          pkg.devDependencies?.remix
      )
    } catch {
      return false
    }
  },
  async routes(ctx: AdapterContext): Promise<AdapterResult> {
    const roots = ['app/routes']
    const routes = new Set<string>()
    for (const r of roots) {
      const dir = path.join(ctx.projectRoot, r)
      const files = await globby(['**/*.{tsx,ts,jsx,js,md,mdx}'], { cwd: dir, dot: false })
      for (const f of files) {
        routes.add(remixFileToRoute(f))
      }
    }
    return { routes: Array.from(routes), buildDirs: ['public'] }
  },
}
