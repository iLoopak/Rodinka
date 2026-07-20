import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Wave 6 pins. The bootstrap is the one path every user walks before anything
// else works, so its ordering and its logging are worth freezing.

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const useFamily = read('src/hooks/useFamily.ts')
const useSession = read('src/hooks/useSession.ts')
const app = read('src/App.tsx')
const routing = read('src/auth/authRoutingState.ts')

describe('bootstrap parallelization', () => {
  it('starts the identity cache read and the membership query before awaiting either', () => {
    const cacheStart = useFamily.indexOf('const cachePromise')
    const queryStart = useFamily.indexOf('const membershipPromise')
    const firstAwait = useFamily.indexOf('await membershipPromise')
    expect(cacheStart).toBeGreaterThan(-1)
    expect(queryStart).toBeGreaterThan(cacheStart)
    // Both promises must exist before anything blocks on a result.
    expect(firstAwait).toBeGreaterThan(queryStart)
  })

  it('does not re-introduce an await between the two reads', () => {
    const between = useFamily.slice(
      useFamily.indexOf('const cachePromise'),
      useFamily.indexOf('const membershipPromise'),
    )
    expect(between).not.toMatch(/\bawait\b/)
  })

  it('gives the identity cache its own smaller budget now that it blocks nothing', () => {
    expect(useFamily).toContain('CACHE_TIMEOUT_MS')
    expect(useFamily).toMatch(/CACHE_TIMEOUT_MS = 3_000/)
  })
})

describe('bootstrap safety', () => {
  it('keeps the cached identity behind a matching user id and a live session', () => {
    expect(useFamily).toContain("current.userId !== userId || current.status !== 'loading'")
    expect(routing).toContain('family.userId !== session.user.id')
  })

  it('only lets a genuine network outage fall back to cached family data', () => {
    expect(useFamily).toContain('isNetworkUnavailableError(error)')
    expect(useFamily).toContain("status: cached && isNetworkError ? 'resolved' : 'error'")
  })

  it('remounts the provider graph on an identity scope change', () => {
    expect(app).toContain('const scopeKey = `${routing.session.user.id}:${routing.member.family_id}`')
    expect(app).toContain('key={scopeKey}')
  })

  it('never treats an unresolved auth check as a sign-out', () => {
    expect(useSession).toContain("status: 'unavailable'")
    expect(routing).toContain("if (auth === 'unavailable') return { status: 'authError'")
  })
})

describe('bootstrap logging carries no personal data', () => {
  // BOOT lines land in real users' consoles and in bug reports. They may say
  // what happened, never who it happened to.
  const forbidden = /console\.(info|error|warn|debug|log)\([^)]*\b(email|display_name|vocative|user_id|userId|session\.user|\.user\.id|member\.id|familyId: [^n])/

  it.each([
    ['src/hooks/useSession.ts', useSession],
    ['src/hooks/useFamily.ts', useFamily],
    ['src/App.tsx', app],
  ])('%s logs only booleans and stable labels', (_name, source) => {
    expect(source).not.toMatch(forbidden)
  })

  it('logs membership results as presence, not identity', () => {
    expect(useFamily).toContain('{ found: Boolean(next) }')
    expect(useFamily).toContain('{ cached: Boolean(cached) }')
    expect(useSession).toContain('authenticated: Boolean(nextSession)')
  })
})
