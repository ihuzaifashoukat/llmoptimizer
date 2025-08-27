// Example Astro configuration using llmoptimizer integration
import { defineConfig } from 'astro/config'
import llm from 'llmoptimizer/astro'

export default defineConfig({
  integrations: [
    llm({
      // static: build-scan on dist with baseUrl mapping → crawl fallback
      mode: 'static',
      baseUrl: process.env.SITE_URL || 'https://example.com',
      robots: true,
    }),
  ],
})

