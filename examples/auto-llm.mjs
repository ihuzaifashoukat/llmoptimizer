// Example auto postbuild script
// Usage in package.json: { "scripts": { "postbuild": "node examples/auto-llm.mjs" } }
import { autoPostbuild } from '../dist/auto.js'

const baseUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL
const res = await autoPostbuild({ baseUrl, log: true })
console.log('[example] autoPostbuild result:', res)

