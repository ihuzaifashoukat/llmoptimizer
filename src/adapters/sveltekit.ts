import { glob } from 'globby'
import path from 'node:path'
import fs from 'node:fs/promises'
import type { AdapterContext, AdapterResult, FrameworkAdapter } from './index'

function toRouteFromRoutesDir(rel: string): string {
  // Remove leading slash if any
  rel = rel.replace(/^\/+/, '')
  // Strip +page.*, +layout.* segments. Route is the folder path containing +page.*
  const parts = rel.split(path.sep)
  // If file matches +page or +layout, compute route path from folder
  if (/^\+page(\.|$)/.test(parts[parts.length - 1]) || /^\+layout(\.|$)/.test(parts[parts.length - 1])) {
    parts.pop()
  }
  const mapped = parts.map((seg) =>
    seg
      .replace(/\[(\.\.\.)?(.+?)\]/g, (_m, dots, name) => (dots ? `:${name}*` : `:${name}`))
      .replace(/^\(.*\)$/, '') // group folders become empty
  )
  const route = '/' + mapped.filter(Boolean).join('/')
  return route || '/'
}

export const SvelteKitAdapter: FrameworkAdapter = {
  name: 'sveltekit',
  async detect(ctx: AdapterContext) {
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(ctx.projectRoot, 'package.json'), 'utf8'))
      return Boolean(pkg.dependencies?.['@sveltejs/kit'] || pkg.devDependencies?.['@sveltejs/kit'])
    } catch {
      return false
    }
  },
  async routes(ctx: AdapterContext): Promise<AdapterResult> {
    const dir = path.join(ctx.projectRoot, 'src/routes')
    const files = await glob(['**/*', '!**/*.d.ts'], { cwd: dir, dot: false })
    const routes = new Set<string>()
    for (const f of files) {
      if (!/\+page\.|\.svelte$/.test(f)) continue
      routes.add(toRouteFromRoutesDir(f))
    }
    return { routes: Array.from(routes), buildDirs: ['build'] }
  },
}
