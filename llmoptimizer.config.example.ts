import { defineConfig } from 'llmoptimizer'

// Example configuration showcasing common, sensible defaults and advanced options.
// Save as llmoptimizer.config.ts at your project root.
export default defineConfig({
  // Base site URL used in crawl/adapter/build-scan modes to resolve absolute links.
  // baseUrl: 'https://example.com',

  // Robots handling for network modes (crawl/adapter/build-enrichment)
  obeyRobots: true,

  // Crawl breadth/perf controls (used in crawl/adapter modes)
  maxPages: 200,
  concurrency: 8,
  network: {
    // Add a small delay between HTTP requests if needed
    // delayMs: 100,
    sitemap: {
      // Concurrency and delay when following nested sitemaps
      concurrency: 6,
      // delayMs: 50,
    },
  },

  // Include/exclude filters (apply to crawl, sitemap, static, and build-scan)
  include: [
    // '/docs/*',
    // '/guide/*',
  ],
  exclude: [
    // '/admin/*',
    // '/drafts/*',
  ],

  // Parameter sampling for adapter/build enrichment of dynamic routes
  // Provide global param samples, an optional function, and/or route-specific overrides
  params: {
    slug: ['welcome', 'hello-world'],
    id: ['1', '2', '42'],
    lang: ['en', 'es'],
    locale: ['en', 'en-US'],
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  paramSamples: (name: string) => {
    if (name === 'page') return ['1', '2']
    return []
  },
  routeParams: {
    '/blog/:slug': { slug: ['welcome', 'hello-world'] },
    '/docs/:lang/getting-started': { lang: ['en', 'es'] },
  },
  // Explicit routes to include in adapter mode (in addition to detected ones)
  routes: [
    // '/status',
    // '/pricing',
  ],

  // Build scan settings: directories to search for HTML when using --build-scan
  buildScan: {
    dirs: [
      'dist',
      'build',
      'out',
      'public',
      '.output/public',
      '.next/server/pages',
      '.next/server/app',
    ],
  },

  // Rendering options (Markdown is default format; theme defaults to 'structured')
  render: {
    theme: 'structured', // 'default' | 'compact' | 'detailed' | 'structured'
    // Optional: provide a custom markdown renderer instead of built-in themes
    // markdown: (site, pages) => `# Custom\nPages: ${pages.length}`,
    structured: {
      // Tune sample sizes in structured output
      limits: { headings: 16, links: 12, images: 8 },
      // Control category ordering and keyword mapping (by URL path or H1)
      categories: {
        order: [
          'Home',
          'Products',
          'Product Categories',
          'Docs',
          'Guides',
          'API',
          'Policies',
          'Important',
          'Blog',
          'Company',
          'Legal',
          'Support',
          'Examples',
          'Other',
        ],
        keywords: {
          Products: ['product', 'pricing', 'features'],
          'Product Categories': ['category', 'categories', 'catalog', 'collection'],
          Policies: ['privacy', 'terms', 'cookies', 'policy', 'policies', 'security', 'gdpr'],
          Important: ['status', 'uptime', 'login', 'signup', 'contact'],
        },
      },
    },
  },

  // Output target
  output: {
    file: 'public/llms.txt',
    format: 'markdown', // 'markdown' | 'json'
  },

  // Robots.txt generator defaults (used by `llmoptimizer robots` and helpers when enabled)
  robots: {
    outFile: 'public/robots.txt',
    allowAll: true,
    llmAllow: true,
    searchAllow: true,
    // Optionally add sitemaps
    // sitemaps: ['https://example.com/sitemap.xml'],
  },
})
