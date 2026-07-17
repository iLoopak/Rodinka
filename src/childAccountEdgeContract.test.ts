import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const edge = readFileSync(new URL('../supabase/functions/manage-child-account/index.ts', import.meta.url), 'utf8')

describe('managed child account server boundary', () => {
  it('validates the bearer token and derives actor and family server-side', () => {
    expect(edge).toContain('callerClient.auth.getUser(token)')
    expect(edge).toContain(".eq('user_id', callerData.user.id)")
    expect(edge).toContain(".eq('family_id', actor.family_id)")
    expect(edge).not.toMatch(/input\.familyId|input\.userId|input\.role/)
  })

  it('uses Auth admin APIs and cleans up a user after failed linking', () => {
    expect(edge).toContain('service.auth.admin.createUser')
    expect(edge).toContain('service.auth.admin.deleteUser(created.user.id)')
    expect(edge).toContain("service.rpc('finalize_child_account_provision'")
  })

  it('detaches database access before deleting Auth access', () => {
    const detach = edge.indexOf("service.rpc('detach_child_account_access'")
    const deletion = edge.indexOf('service.auth.admin.deleteUser(authUserId)')
    expect(detach).toBeGreaterThan(0)
    expect(deletion).toBeGreaterThan(detach)
  })

  it('never writes credential input outside Supabase Auth', () => {
    expect(edge).not.toMatch(/\.from\([^)]*\)\.(insert|update)\([^)]*password/s)
    expect(edge).not.toMatch(/console\.(log|error).*password/i)
  })
})
