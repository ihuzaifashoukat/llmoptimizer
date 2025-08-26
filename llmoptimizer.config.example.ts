import { defineConfig } from './src/lib/config'

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
    file: 'llm.txt',
    format: 'markdown',
  },
})

