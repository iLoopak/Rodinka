import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabaseClient'

const BOOT_TIMEOUT_MS = 10_000

export function useSession() {
  // `undefined` means Supabase has not answered yet. `null` is a confirmed
  // unauthenticated state and must never be confused with initial loading.
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    let active = true
    let settledByListener = false
    let timeout: ReturnType<typeof globalThis.setTimeout> | null = null

    console.info('BOOT 1 auth init')

    timeout = globalThis.setTimeout(() => {
      if (!active || settledByListener) return
      console.error(`BOOT ERROR auth init timed out after ${BOOT_TIMEOUT_MS}ms`)
      setSession(null)
    }, BOOT_TIMEOUT_MS)

    const settle = (nextSession: Session | null, source: string) => {
      if (!active) return
      if (timeout) {
        globalThis.clearTimeout(timeout)
        timeout = null
      }
      console.info('BOOT 2 auth ready', { source, authenticated: Boolean(nextSession) })
      setSession(nextSession)
    }

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!active) return
      settledByListener = true
      settle(newSession, 'onAuthStateChange')
    })

    void supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!active || settledByListener) return
        if (error) console.error('BOOT ERROR auth getSession failed:', error.message)
        settle(error ? null : data.session, 'getSession')
      })
      .catch((error: unknown) => {
        if (!active || settledByListener) return
        console.error('BOOT ERROR auth getSession rejected:', error instanceof Error ? error.message : 'unknown error')
        settle(null, 'getSession')
      })

    return () => {
      active = false
      if (timeout) globalThis.clearTimeout(timeout)
      listener.subscription.unsubscribe()
    }
  }, [])

  return { session, loading: session === undefined }
}
