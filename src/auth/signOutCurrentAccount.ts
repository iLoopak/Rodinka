import { releasePushOnSignOut } from '../push/pushClient'
import { getShoppingLocalStore } from '../shopping/shoppingIndexedDb'
import { supabase } from '../supabaseClient'

interface SignOutCurrentAccountOptions {
  userId: string
  clearCalendarAccount: () => Promise<void>
}

export async function signOutCurrentAccount({ userId, clearCalendarAccount }: SignOutCurrentAccountOptions) {
  try {
    await releasePushOnSignOut()
  } catch (error) {
    console.error('Failed to release push subscription during sign-out:', error instanceof Error ? error.message : 'unknown error')
  }

  try {
    await Promise.all([
      clearCalendarAccount(),
      getShoppingLocalStore().saveFamilyIdentity(userId, null),
    ])
  } catch (error) {
    console.error('Failed to clear offline account data:', error instanceof Error ? error.message : 'unknown error')
  }

  const { error } = await supabase.auth.signOut()
  if (error) throw error

  // Auth lives at the root route. replaceState also prevents the browser back
  // button from reopening the previously protected URL after sign-out.
  if (typeof window !== 'undefined') window.history.replaceState(null, '', '/')
}
