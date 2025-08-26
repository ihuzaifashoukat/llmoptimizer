import fs from 'node:fs/promises'
import path from 'node:path'
import type { AdapterContext, AdapterResult, FrameworkAdapter } from './index'

export const AngularAdapter: FrameworkAdapter = {
  name: 'angular',
  async detect(ctx: AdapterContext) {
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(ctx.projectRoot, 'package.json'), 'utf8'))
      return Boolean(pkg.dependencies?.['@angular/core'] || pkg.devDependencies?.['@angular/core'])
    } catch { return false }
  },
  async routes(ctx: AdapterContext): Promise<AdapterResult> {
    // Angular CLI builds to dist/<project>/browser by default for SSR/browser builds.
    let projectName: string | undefined
    try {
      const angularJsonPath = path.join(ctx.projectRoot, 'angular.json')
      const angularJson = JSON.parse(await fs.readFile(angularJsonPath, 'utf8'))
      // prefer defaultProject
      projectName = angularJson.defaultProject || Object.keys(angularJson.projects || {})[0]
      // Fallback to package name if no angular.json
    } catch {
      try {
        const pkg = JSON.parse(await fs.readFile(path.join(ctx.projectRoot, 'package.json'), 'utf8'))
        projectName = pkg.name
      } catch {}
    }
    const buildDirs = ['dist']
    if (projectName) {
      buildDirs.push(`dist/${projectName}`)
      buildDirs.push(`dist/${projectName}/browser`)
    }
    return { routes: [], buildDirs }
  },
}
