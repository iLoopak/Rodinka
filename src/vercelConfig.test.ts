/// <reference types="node" />

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

interface VercelConfig {
  $schema?: string
  rewrites?: Array<{ source?: string; destination?: string }>
  redirects?: unknown
  routes?: unknown
}

const repositoryRoot = process.cwd()
const config = JSON.parse(
  readFileSync(join(repositoryRoot, 'vercel.json'), 'utf8')
) as VercelConfig

describe('Vercel deployment configuration', () => {
  it('rewrites unresolved SPA routes to index.html without redirecting', () => {
    expect(config.$schema).toBe('https://openapi.vercel.sh/vercel.json')
    expect(config.rewrites).toEqual([
      { source: '/(.*)', destination: '/index.html' },
    ])
    expect(config.redirects).toBeUndefined()
    expect(config.routes).toBeUndefined()
  })

  it('does not mask a root Vercel API or functions directory', () => {
    expect(existsSync(join(repositoryRoot, 'api'))).toBe(false)
    expect(existsSync(join(repositoryRoot, 'functions'))).toBe(false)
  })
})
