import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../supabaseClient'
import { describeAuthAccount, type AuthAccount } from '../lib/emailChange'

// The login email is owned by Supabase Auth, never by a profile row, so the
// account settings read it straight from the auth user. Subscribing to
// onAuthStateChange means a confirmed email change (which arrives as a
// USER_UPDATED event, or as a fresh session after the confirmation redirect)
// replaces the address on screen instead of leaving a stale cached one.
export function useAuthAccount(): { account: AuthAccount; loading: boolean; refresh: () => Promise<void> } {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.auth.getUser()
    // A failure here just means we keep whatever the session listener gave us;
    // the account row degrades to the known email rather than blanking out.
    if (!error) setUser(data.user ?? null)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    return () => listener.subscription.unsubscribe()
  }, [refresh])

  return { account: describeAuthAccount(user), loading, refresh }
}
