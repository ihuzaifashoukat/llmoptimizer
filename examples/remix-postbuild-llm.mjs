// Example Remix postbuild script
// Add to package.json: { "scripts": { "postbuild": "node examples/remix-postbuild-llm.mjs" } }
import { runAfterRemixBuild } from '../dist/remix.js'

const baseUrl = process.env.SITE_URL || 'https://example.com'
await runAfterRemixBuild({
  // static: build-scan on public with baseUrl mapping → crawl fallback
  mode: 'static',
  baseUrl,
  outFile: 'public/llms.txt',
  robots: true,
})

console.log('[example] llms.txt generated for Remix build')

