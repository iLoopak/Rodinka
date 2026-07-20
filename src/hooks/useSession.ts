import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabaseClient'
import { isNetworkUnavailableError } from '../network/networkStatus'

const BOOT_TIMEOUT_MS = 10_000

export type AuthSessionStatus =
  /** Supabase has not answered yet. */
  | 'loading'
  /** A session exists. */
  | 'authenticated'
  /** Supabase confirmed there is no session. */
  | 'anonymous'
  /** We could not find out. Retryable — never treat this as a sign-out. */
  | 'unavailable'

interface AuthSessionState {
  status: AuthSessionStatus
  session: Session | null | undefined
  error: string | null
}

const loadingState: AuthSessionState = { status: 'loading', session: undefined, error: null }

export function useSession() {
  const [state, setState] = useState<AuthSessionState>(loadingState)
  // Bumped by retry() to re-run the bootstrap effect from scratch.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    let settledByListener = false
    let timeout: ReturnType<typeof globalThis.setTimeout> | null = null

    console.info('BOOT 1 auth init')

    timeout = globalThis.setTimeout(() => {
      if (!active || settledByListener) return
      console.error(`BOOT ERROR auth init timed out after ${BOOT_TIMEOUT_MS}ms`)
      // Deliberately NOT `session = null`. A timeout means we never found out
      // whether this browser has a session; showing the login screen would
      // claim a sign-out that never happened, and the user would "log in"
      // again into the session they already had.
      setState({ status: 'unavailable', session: undefined, error: 'auth-init-timeout' })
    }, BOOT_TIMEOUT_MS)

    const settle = (nextSession: Session | null, source: string) => {
      if (!active) return
      if (timeout) {
        globalThis.clearTimeout(timeout)
        timeout = null
      }
      console.info('BOOT 2 auth ready', { source, authenticated: Boolean(nextSession) })
      setState({
        status: nextSession ? 'authenticated' : 'anonymous',
        session: nextSession,
        error: null,
      })
    }

    // Only an answer from Supabase can confirm "anonymous"; not reaching it at
    // all is unresolved. An expired or invalid refresh token IS an answer —
    // the server told us this browser has no usable session — so it must keep
    // going to the login screen, not to a retry loop.
    const fail = (reason: string, detail: string) => {
      if (!active) return
      if (timeout) {
        globalThis.clearTimeout(timeout)
        timeout = null
      }
      console.error(`BOOT ERROR auth ${reason}:`, detail)
      setState({ status: 'unavailable', session: undefined, error: reason })
    }

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!active) return
      settledByListener = true
      settle(newSession, 'onAuthStateChange')
    })

    void supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!active || settledByListener) return
        if (!error) {
          settle(data.session, 'getSession')
          return
        }
        if (isNetworkUnavailableError(error)) {
          fail('getSession-unreachable', error.message)
          return
        }
        console.error('BOOT ERROR auth getSession failed:', error.message)
        settle(null, 'getSession')
      })
      // A rejection means no answer came back at all — always unresolved.
      .catch((error: unknown) => {
        if (!active || settledByListener) return
        fail('getSession-rejected', error instanceof Error ? error.message : 'unknown error')
      })

    return () => {
      active = false
      if (timeout) globalThis.clearTimeout(timeout)
      listener.subscription.unsubscribe()
    }
  }, [attempt])

  const retry = useCallback(() => {
    setState(loadingState)
    setAttempt((current) => current + 1)
  }, [])

  return {
    session: state.session,
    status: state.status,
    authError: state.error,
    retry,
    loading: state.status === 'loading',
  }
}
