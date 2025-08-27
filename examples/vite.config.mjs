// Example Vite configuration with llmoptimizer plugin
import { defineConfig } from 'vite'
import { llmOptimizer } from 'llmoptimizer/vite'

export default defineConfig({
  plugins: [
    llmOptimizer({
      // static: build-scan on dist with baseUrl mapping → crawl fallback
      mode: 'static',
      baseUrl: process.env.SITE_URL || 'https://example.com',
      robots: true,
      log: true,
    }),
  ],
})

