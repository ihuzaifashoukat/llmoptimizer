// Example Nuxt 3 configuration using llmoptimizer module
// Usage: place in your Nuxt app and adjust options as needed
export default defineNuxtConfig({
  modules: [[
    'llmoptimizer/nuxt',
    {
      // static: build-scan on .output/public with baseUrl mapping → crawl fallback
      mode: 'static',
      baseUrl: process.env.NUXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://example.com',
      robots: true,
    },
  ]],
})

