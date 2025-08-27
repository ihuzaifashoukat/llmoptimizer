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
  async discoverParams(ctx: AdapterContext) {
    const params: Record<string, string[]> = {}
    // i18n locales from nuxt.config.* or locales directory
    const locales = new Set<string>()
    const cfgFiles = ['nuxt.config.ts', 'nuxt.config.js', 'nuxt.config.mjs', 'nuxt.config.cjs']
    for (const f of cfgFiles) {
      try {
        const src = await fs.readFile(path.join(ctx.projectRoot, f), 'utf8')
        // Look for i18n: { locales: [...] } or default export with i18n.locales
        const m = src.match(/i18n\s*:\s*\{[\s\S]*?locales\s*:\s*\[([^\]]+)\]/m)
        if (m) {
          const arr = m[1]
          const re = /['\"]([a-zA-Z0-9-]+)['\"]/g
          let mm: RegExpExecArray | null
          while ((mm = re.exec(arr))) locales.add(mm[1])
        }
      } catch {}
    }
    try {
      const locDir = path.join(ctx.projectRoot, 'locales')
      const items = await fs.readdir(locDir)
      for (const it of items) {
        const base = path.basename(it, path.extname(it))
        if (base) locales.add(base)
      }
    } catch {}
    if (locales.size) {
      params['lang'] = Array.from(locales)
      params['locale'] = Array.from(locales)
    }
    // Content/blog slug seeds
    const slugs = new Set<string>(['welcome', 'hello-world'])
    try {
      const files = await globby([
        'content/**/*.{md,mdx,markdown,mdoc}', 'src/content/**/*.{md,mdx,markdown,mdoc}',
        'content/blog/*.*', 'src/content/blog/*.*',
        'pages/blog/*.*', 'src/pages/blog/*.*',
      ], { cwd: ctx.projectRoot })
      for (const f of files) {
        const base = path.basename(f, path.extname(f))
        if (base && base !== 'index') slugs.add(base)
      }
    } catch {}
    params['slug'] = Array.from(slugs)
    params['id'] = ['1', '2', '42']
    return params
  },
  async discoverRouteParams(ctx: AdapterContext) {
    const routeParams: Record<string, Record<string, string[]>> = {}
    // map i18n params when present
    const samples = await (this.discoverParams as any)(ctx).catch(() => ({}))
    if (samples?.lang?.length) {
      routeParams['/:lang'] = { lang: samples.lang }
      routeParams['/:lang/*'] = { lang: samples.lang }
    }
    if (samples?.locale?.length) {
      routeParams['/:locale'] = { locale: samples.locale }
      routeParams['/:locale/*'] = { locale: samples.locale }
    }
    // Blog slug
    if (samples?.slug?.length) {
      routeParams['/blog/:slug'] = { slug: samples.slug }
    }
    return routeParams
  },
}
