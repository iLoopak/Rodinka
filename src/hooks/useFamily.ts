import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../supabaseClient'
import type { FamilyMember } from './useFamilyMembers'
import { getShoppingLocalStore } from '../shopping/shoppingIndexedDb'
import { isNetworkUnavailableError } from '../network/networkStatus'

export type Member = FamilyMember

export type FamilyMembershipStatus = 'idle' | 'loading' | 'resolved' | 'error'

interface FamilyMembershipState {
  userId: string | null
  status: FamilyMembershipStatus
  member: Member | null
  connectionError: string | null
  dataError: string | null
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

    let cached: Member | null = null
    try {
      cached = await getShoppingLocalStore().loadFamilyIdentity(userId)
    } catch (error) {
      console.error('Failed to load cached family identity:', error instanceof Error ? error.message : 'unknown error')
    }

    let timeout: ReturnType<typeof globalThis.setTimeout> | null = null
    // RLS ensures this only ever returns rows the current user is allowed to see
    const query = supabase
        .from('members')
        .select('id, family_id, display_name, role, user_id, birth_date, color_key, custom_color, avatar_path, grammatical_gender, vocative_name, status, removed_at, removed_by_member_id, removal_reason')
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle()
    const { data, error } = await Promise.race([
      query,
      new Promise<{ data: null; error: Error }>((resolve) => {
        timeout = globalThis.setTimeout(() => resolve({ data: null, error: new Error('Backend request timed out') }), 5500)
      }),
    ])
    if (timeout) globalThis.clearTimeout(timeout)
    if (request !== requestVersion.current) return

    if (error) {
      console.error('Failed to load family membership:', error.message)
      const isNetworkError = isNetworkUnavailableError(error)
      setState({
        userId,
        status: cached && isNetworkError ? 'resolved' : 'error',
        member: cached && isNetworkError ? cached : null,
        connectionError: isNetworkError ? error.message : null,
        dataError: isNetworkError ? null : error.message,
      })
    } else {
      const next = data ? ({ ...data, avatar_url: null } as Member) : null
      setState({ userId, status: 'resolved', member: next, connectionError: null, dataError: null })
      try {
        await getShoppingLocalStore().saveFamilyIdentity(userId, next)
      } catch (cacheError) {
        console.error('Failed to save family identity:', cacheError instanceof Error ? cacheError.message : 'unknown error')
      }
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
    resolved: scopedState.status === 'resolved',
    refresh,
    connectionError: scopedState.connectionError,
    dataError: scopedState.dataError,
  }
}
