// Example Next.js postbuild script
// Usage in package.json: { "scripts": { "postbuild": "node examples/next-postbuild-llm.mjs" } }
import { runAfterNextBuild } from '../dist/next.js'

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://example.com'
await runAfterNextBuild({
  projectRoot: process.cwd(),
  baseUrl,
  outFile: 'public/llms.txt',
  mode: process.env.LLM_MODE || 'static', // 'static' | 'adapter' | 'crawl'
  robots: true,
  log: true,
})

console.log('[example] llms.txt generated for Next.js build')

