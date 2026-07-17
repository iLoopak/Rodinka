import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export type ChildAccountStatus = 'provisioning' | 'active' | 'revoked'

export interface ChildAccount {
  member_id: string
  login_name: string
  status: ChildAccountStatus
  activated_at: string | null
  password_reset_at: string | null
  revoked_at: string | null
}

// child_accounts also holds internal_identifier and auth_user_id. RLS lets
// adults read them, but they are Auth plumbing with no place in the UI, so
// they are never selected here — what isn't fetched can't leak into a render,
// a log, or an error payload.
const SAFE_COLUMNS = 'member_id, login_name, status, activated_at, password_reset_at, revoked_at'

export function useChildAccounts(memberIds: string[], enabled: boolean) {
  const [accounts, setAccounts] = useState<Map<string, ChildAccount>>(new Map())
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  // Refetching is driven by which members exist, so the identity of the array
  // itself must not retrigger the effect on every parent render.
  const memberKey = [...memberIds].sort().join(',')

  const refresh = useCallback(async () => {
    if (!enabled || !memberKey) {
      setAccounts(new Map())
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error: loadError } = await supabase
      .from('child_accounts')
      .select(SAFE_COLUMNS)
      .in('member_id', memberKey.split(','))

    if (loadError) {
      // Children and outsiders are filtered out by RLS rather than by an
      // error, so a failure here is a real fault, not a permission signal.
      console.error('Failed to load child accounts:', loadError.message)
      setAccounts(new Map())
      setError(loadError.message)
    } else {
      setAccounts(new Map((data ?? []).map((row) => [row.member_id, row as ChildAccount])))
      setError(null)
    }
    setLoading(false)
  }, [enabled, memberKey])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { accounts, loading, error, refresh }
}
