import { describe, expect, it } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import { isManagedChildSession } from './managedChildSession'

describe('managed child session detection', () => {
  it('uses server-controlled app metadata', () => {
    const session = { user: { app_metadata: { account_type: 'managed_child' } } } as unknown as Session
    expect(isManagedChildSession(session)).toBe(true)
    expect(isManagedChildSession({ user: { app_metadata: {} } } as unknown as Session)).toBe(false)
  })
})
