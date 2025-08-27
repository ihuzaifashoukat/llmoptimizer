// scripts/angular-postbuild-llm.mjs
import { runAfterAngularBuild } from 'llmoptimizer/angular'

await runAfterAngularBuild({
  // static: scan Angular build output for HTML. distDir is auto-detected from angular.json
  // if omitted; you can override via distDir: 'dist/your-project/browser'
  mode: 'static',
  baseUrl: process.env.SITE_URL || 'https://your.app',
  theme: 'structured',
  // Optional filtering and theme tuning
  // include: ['/docs/*', '/products/*'],
  // exclude: ['/admin/*'],
  // renderOptions: { limits: { headings: 12, links: 10, images: 6 } },
  robots: { outFile: 'dist/robots.txt' },
})

// Add to package.json:
// { "scripts": { "postbuild": "node scripts/angular-postbuild-llm.mjs" } }

