import { globby } from 'globby'
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
    const files = await globby(['**/*', '!**/*.d.ts'], { cwd: dir, dot: false })
    const routes = new Set<string>()
    for (const f of files) {
      if (!/\+page\.|\.svelte$/.test(f)) continue
      routes.add(toRouteFromRoutesDir(f))
    }
    return { routes: Array.from(routes), buildDirs: ['build'] }
  },
  async discoverParams(ctx: AdapterContext) {
    const params: Record<string, string[]> = {}
    try {
      const dir = path.join(ctx.projectRoot, 'src', 'routes')
      const files = await globby(['**/*', '!**/*.d.ts'], { cwd: dir, dot: false })
      const names = new Set<string>()
      for (const f of files) {
        const route = toRouteFromRoutesDir(f)
        const mm = route.match(/:([A-Za-z0-9_]+)/g)
        mm?.forEach((m) => names.add(m.slice(1)))
      }
      for (const n of names) {
        if (n === 'slug') params[n] = ['welcome', 'hello-world']
        else if (n === 'id') params[n] = ['1', '2', '42']
        else params[n] = ['sample']
      }
    } catch {}
    // Blog slugs
    const slugSet = new Set<string>(['welcome', 'hello-world'])
    try {
      const blog = await globby(['src/routes/blog/*', 'src/routes/blog/**/+page.*'], { cwd: ctx.projectRoot })
      for (const f of blog) {
        const base = path.basename(f, path.extname(f))
        if (base && base !== 'index' && !base.startsWith('+')) slugSet.add(base)
      }
    } catch {}
    params['slug'] = Array.from(slugSet)
    return params
  },
  async discoverRouteParams(ctx: AdapterContext) {
    const routeParams: Record<string, Record<string, string[]>> = {}
    const samples = await (this.discoverParams as any)(ctx).catch(() => ({}))
    if (samples?.slug?.length) routeParams['/blog/:slug'] = { slug: samples.slug }
    return routeParams
  },
}
