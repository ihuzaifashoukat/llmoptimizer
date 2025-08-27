import fs from 'node:fs/promises'
import path from 'node:path'
import { globby } from 'globby'
import type { AdapterContext, AdapterResult, FrameworkAdapter } from './index'
import { extractNextRoutes } from '../lib/next-extract'

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
    const extracted = await extractNextRoutes(ctx.projectRoot)
    const routes = new Set<string>()
    for (const r of extracted.routes) {
      if (r.type === 'page') routes.add(r.route || '/')
    }
    return { routes: Array.from(routes), buildDirs: ['.next/export', '.next/server/pages', '.next/server/app', 'out'] }
  },
  async discoverParams(ctx: AdapterContext) {
    const params: Record<string, string[]> = {}
    // Locales from config/public/locales via extractor
    try {
      const extracted = await extractNextRoutes(ctx.projectRoot)
      if (extracted.locales?.length) {
        params['lang'] = extracted.locales
        params['locale'] = extracted.locales
      }
      // Inspect dynamic params present in routes
      const dynNames = new Set<string>()
      for (const r of extracted.routes) {
        r.params?.forEach((p) => dynNames.add(p))
      }
      // Seed common defaults
      for (const name of dynNames) {
        if (name === 'slug') params[name] = ['welcome', 'hello-world']
        else if (name === 'id') params[name] = ['1', '2', '42']
        else params[name] = ['sample']
      }
    } catch {}
    // Add a few generic samples always
    params['id'] = Array.from(new Set([...(params['id'] || []), '1', '2', '42']))
    params['slug'] = Array.from(new Set([...(params['slug'] || []), 'welcome', 'hello-world']))
    return params
  },
  async discoverRouteParams(ctx: AdapterContext) {
    const slugSamples = new Set<string>(['welcome', 'hello-world'])
    const langSamples = new Set<string>()
    try {
      const blogFiles = await globby([
        'content/blog/*.*', 'src/content/blog/*.*',
        'content/posts/*.*', 'src/content/posts/*.*',
        'pages/blog/*.*', 'src/pages/blog/*.*',
        'app/blog/*.*', 'src/app/blog/*.*',
        'app/blog/**/page.*', 'src/app/blog/**/page.*',
      ], { cwd: ctx.projectRoot })
      for (const f of blogFiles) {
        const base = path.basename(f, path.extname(f))
        if (base && base !== 'index') slugSamples.add(base)
      }
      // locales
      const extracted = await extractNextRoutes(ctx.projectRoot)
      if (extracted.locales?.length) extracted.locales.forEach((l) => langSamples.add(l))
    } catch {}
    const routeParams: Record<string, Record<string, string[]>> = {}
    // Offer samples for any route pattern containing :slug
    routeParams['/blog/:slug'] = { slug: Array.from(slugSamples) }
    // Common i18n param patterns
    if (langSamples.size) {
      routeParams['/:lang'] = { lang: Array.from(langSamples) }
      routeParams['/:lang/*'] = { lang: Array.from(langSamples) }
      routeParams['/:locale'] = { locale: Array.from(langSamples) }
      routeParams['/:locale/*'] = { locale: Array.from(langSamples) }
    }
    return routeParams
  },
}
