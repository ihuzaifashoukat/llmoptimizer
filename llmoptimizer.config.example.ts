import { defineConfig } from 'llmoptimizer'

export default defineConfig({
  // baseUrl: 'https://example.com',
  obeyRobots: true,
  maxPages: 100,
  concurrency: 5,
  include: [
    // 'https://example.com/docs/*'
  ],
  exclude: [
    // 'https://example.com/admin/*'
  ],
  output: {
    file: 'llms.txt',
    format: 'markdown',
  },
})
