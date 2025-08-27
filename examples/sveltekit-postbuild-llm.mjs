// scripts/sveltekit-postbuild-llm.mjs
import { runAfterSvelteKitBuild } from 'llmoptimizer/sveltekit'

await runAfterSvelteKitBuild({
  // static: scan 'build' for HTML and map to URLs using baseUrl.
  // falls back to a light crawl if no HTML found (SSR only builds)
  mode: 'static',
  buildDir: 'build',
  baseUrl: process.env.SITE_URL || 'https://your.app',
  outFile: 'build/llms.txt',
  theme: 'structured',
  // Optionally filter/limit
  // include: ['/docs/*', '/guide/*'],
  // exclude: ['/admin/*'],
  // Structured theme tweaks (see README config section)
  // renderOptions: { limits: { headings: 12, links: 10, images: 6 } },
  robots: { outFile: 'build/robots.txt' },
})

// Add to package.json:
// { "scripts": { "postbuild": "node scripts/sveltekit-postbuild-llm.mjs" } }

