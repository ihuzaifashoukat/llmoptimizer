// Example generic Node/React postbuild script
// Usage in package.json: { "scripts": { "postbuild": "node examples/node-postbuild-llm.mjs" } }
import { runAfterBuild } from '../dist/node.js'

await runAfterBuild({
  // static: build-scan on dist with baseUrl mapping → crawl fallback
  mode: 'static',
  rootDir: 'dist',
  baseUrl: process.env.SITE_URL || 'https://example.com',
  robots: true,
})

console.log('[example] llms.txt generated for generic build')

