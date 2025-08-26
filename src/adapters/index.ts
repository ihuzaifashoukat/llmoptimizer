export type AdapterResult = {
  routes: string[]
  buildDirs?: string[]
}

export interface AdapterContext {
  projectRoot: string
}

export interface FrameworkAdapter {
  name: string
  detect(ctx: AdapterContext): Promise<boolean> | boolean
  routes(ctx: AdapterContext): Promise<AdapterResult>
}

const adapters: FrameworkAdapter[] = []

export function registerAdapter(a: FrameworkAdapter) {
  adapters.push(a)
}

export async function detectRoutes(projectRoot: string): Promise<AdapterResult | undefined> {
  for (const a of adapters) {
    if (await a.detect({ projectRoot })) {
      return a.routes({ projectRoot })
    }
  }
}

// Built-in adapters
export { NextAdapter } from './next'
// Auto-register built-ins
import { NextAdapter as _Next } from './next'
import { NuxtAdapter as _Nuxt } from './nuxt'
import { AstroAdapter as _Astro } from './astro'
import { RemixAdapter as _Remix } from './remix'
import { SvelteKitAdapter as _SvelteKit } from './sveltekit'
import { GatsbyAdapter as _Gatsby } from './gatsby'
import { AngularAdapter as _Angular } from './angular'
registerAdapter(_Next)
registerAdapter(_Nuxt)
registerAdapter(_Astro)
registerAdapter(_Remix)
registerAdapter(_SvelteKit)
registerAdapter(_Gatsby)
registerAdapter(_Angular)
