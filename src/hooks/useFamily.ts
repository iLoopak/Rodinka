import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../supabaseClient'
import type { FamilyMember } from './useFamilyMembers'
import { getShoppingLocalStore } from '../shopping/shoppingIndexedDb'
import { isNetworkUnavailableError } from '../network/networkStatus'

export type Member = FamilyMember

export type FamilyMembershipStatus =
  | 'idle'
  | 'loading'
  /** Cached identity is on screen while the server answer is still in flight. */
  | 'cached-validating'
  | 'resolved'
  | 'error'

interface FamilyMembershipState {
  userId: string | null
  status: FamilyMembershipStatus
  member: Member | null
  connectionError: string | null
  dataError: string | null
}

const BOOT_TIMEOUT_MS = 10_000
// The identity cache no longer gates the membership request, so it does not
// need the network-sized budget. An IndexedDB read that takes seconds is
// broken; give up quickly and let the server answer stand alone.
const CACHE_TIMEOUT_MS = 3_000

async function withBootTimeout<T>(step: string, promise: PromiseLike<T>, timeoutMs = BOOT_TIMEOUT_MS): Promise<T> {
  let timeout: ReturnType<typeof globalThis.setTimeout> | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = globalThis.setTimeout(() => {
          console.error(`BOOT ERROR ${step} timed out after ${timeoutMs}ms`)
          reject(new Error(`${step} timed out`))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeout) globalThis.clearTimeout(timeout)
  }
}

const idleFamilyState: FamilyMembershipState = {
  userId: null,
  status: 'idle',
  member: null,
  connectionError: null,
  dataError: null,
}

export function useFamily(userId: string | undefined) {
  const [state, setState] = useState<FamilyMembershipState>(idleFamilyState)
  const requestVersion = useRef(0)
  const scopedUserId = userId ?? null

  const refresh = useCallback(async () => {
    const request = ++requestVersion.current
    if (!userId) {
      setState(idleFamilyState)
      return
    }

    setState({ userId, status: 'loading', member: null, connectionError: null, dataError: null })

    // --- both reads start now -------------------------------------------
    // These used to be sequential: the cache was awaited before the query
    // was even built, so a slow IndexedDB read added its latency (and its
    // own 10s timeout) in front of every membership request. They answer
    // independent questions, so they race instead.
    console.info('BOOT 3 profile loaded', { source: 'local-cache-start' })
    const cachePromise = withBootTimeout(
      'profile cache load',
      getShoppingLocalStore().loadFamilyIdentity(userId),
      CACHE_TIMEOUT_MS,
    ).catch((error: unknown) => {
      console.error('BOOT ERROR profile cache load failed:', error instanceof Error ? error.message : 'unknown error')
      return null
    })

    console.info('BOOT 4 membership loaded', { status: 'started' })
    // RLS ensures this only ever returns rows the current user is allowed to see
    const query = supabase
        .from('members')
        .select('id, family_id, display_name, role, user_id, birth_date, color_key, custom_color, avatar_path, grammatical_gender, vocative_name, status, removed_at, removed_by_member_id, removal_reason')
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle()
    const membershipPromise = withBootTimeout('membership load', query).then(
      (response) => response as { data: unknown; error: { message: string } | null },
      (error: unknown) => ({ data: null, error: error instanceof Error ? error : new Error('membership load failed') }),
    )

    // --- cached identity may open the shell early ------------------------
    // Only ever the cache written for THIS user id (the store is keyed by it),
    // and only while nothing more authoritative has landed. The server result
    // below overwrites this wholesale, so a mismatch cannot survive.
    void cachePromise.then((cached) => {
      if (request !== requestVersion.current) return
      console.info('BOOT 3 profile loaded', { cached: Boolean(cached) })
      if (!cached) return
      setState((current) => {
        if (current.userId !== userId || current.status !== 'loading') return current
        return { userId, status: 'cached-validating', member: cached, connectionError: null, dataError: null }
      })
    })

    // --- the server has authority ----------------------------------------
    const response = await membershipPromise
    if (request !== requestVersion.current) return

    const { data, error } = response
    if (error) {
      console.error('BOOT ERROR membership load failed:', error.message)
      const isNetworkError = isNetworkUnavailableError(error)
      const cached = await cachePromise
      if (request !== requestVersion.current) return
      // A permission/auth error must never leave cached family data on
      // screen — only a genuine network outage may fall back to the cache.
      setState({
        userId,
        status: cached && isNetworkError ? 'resolved' : 'error',
        member: cached && isNetworkError ? cached : null,
        connectionError: isNetworkError ? error.message : null,
        dataError: isNetworkError ? null : error.message,
      })
      return
    }

    const next = data ? ({ ...data, avatar_url: null } as Member) : null
    console.info('BOOT 4 membership loaded', { found: Boolean(next) })
    console.info('BOOT 5 family loaded', { familyId: next?.family_id ?? null })
    // Wholesale replace: a confirmed empty membership clears a cached member
    // and routes to onboarding, and a different family replaces the cached one.
    setState({ userId, status: 'resolved', member: next, connectionError: null, dataError: null })
    try {
      await withBootTimeout('profile cache save', getShoppingLocalStore().saveFamilyIdentity(userId, next), CACHE_TIMEOUT_MS)
    } catch (cacheError) {
      console.error('BOOT ERROR profile cache save failed:', cacheError instanceof Error ? cacheError.message : 'unknown error')
    }
  }, [userId])

  useEffect(() => {
    void refresh()
    return () => {
      requestVersion.current += 1
    }
  }, [refresh])

  // Effects run after render. Deriving a loading state for a mismatched scope
  // closes the one-render gap when auth switches from no user (or another
  // user) to a valid session.
  const scopedState: FamilyMembershipState = state.userId === scopedUserId
    ? state
    : scopedUserId
      ? { userId: scopedUserId, status: 'loading', member: null, connectionError: null, dataError: null }
      : idleFamilyState

  return {
    userId: scopedState.userId,
    status: scopedState.status,
    member: scopedState.member,
    loading: scopedState.status === 'loading',
    validating: scopedState.status === 'cached-validating',
    resolved: scopedState.status === 'resolved',
    refresh,
    connectionError: scopedState.connectionError,
    dataError: scopedState.dataError,
  }
}
