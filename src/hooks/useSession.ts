import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabaseClient'

export function useSession() {
  // `undefined` means Supabase has not answered yet. `null` is a confirmed
  // unauthenticated state and must never be confused with initial loading.
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    let active = true
    let settledByListener = false

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!active) return
      settledByListener = true
      setSession(newSession)
    })

    void supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!active || settledByListener) return
        if (error) console.error('Failed to restore auth session:', error.message)
        setSession(error ? null : data.session)
      })
      .catch((error: unknown) => {
        if (!active || settledByListener) return
        console.error('Failed to restore auth session:', error instanceof Error ? error.message : 'unknown error')
        setSession(null)
      })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  return { session, loading: session === undefined }
}
