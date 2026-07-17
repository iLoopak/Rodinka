import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const worker = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')

describe('offline application shell', () => {
  it('caches navigation and static assets without intercepting remote APIs', () => {
    expect(worker).toContain("const APP_SHELL = ['/'")
    expect(worker).toContain("request.mode === 'navigate'")
    expect(worker).toContain("url.origin !== self.location.origin")
    expect(worker).toContain("url.pathname.startsWith('/assets/')")
    expect(worker).toContain("caches.match('/')")
  })

  it('clones asset responses before asynchronous cache work can consume the body', () => {
    const start = worker.indexOf("if (url.pathname.startsWith('/assets/')")
    const end = worker.indexOf('\nfunction safeDeepLink', start)
    const assetHandler = worker.slice(start, end)
    expect(assetHandler).toContain('const copy = response.clone()')
    expect(assetHandler.indexOf('const copy = response.clone()')).toBeLessThan(assetHandler.indexOf('await caches.open(CACHE_NAME)'))
    expect(assetHandler).not.toContain('cache.put(request, response.clone())')
  })
})
