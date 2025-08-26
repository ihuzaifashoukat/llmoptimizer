import { defineConfig } from 'tsup'

export default defineConfig({
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true,
  target: 'es2021',
  format: ['cjs', 'esm'],
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
    vite: 'src/integrations/vite.ts',
    next: 'src/integrations/next.ts',
    astro: 'src/integrations/astro.ts',
    nuxt: 'src/integrations/nuxt.ts',
    remix: 'src/integrations/remix.ts',
    node: 'src/integrations/node.ts',
  },
  shims: false,
  minify: false,
})
