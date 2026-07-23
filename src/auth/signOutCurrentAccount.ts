import { releasePushOnSignOut } from '../push/releaseOnSignOut'
import { supabase } from '../supabaseClient'
import { buildAccountCleanupSteps, runAccountCleanup } from './accountCleanup'
import { logAccountCleanup } from '../diagnostics/offlineDiagnostics'

interface SignOutCurrentAccountOptions {
  userId: string
  /** Stops the calendar repository (and its realtime channels) before the token goes away. */
  clearCalendarAccount: () => Promise<void>
}

export async function signOutCurrentAccount({ userId, clearCalendarAccount }: SignOutCurrentAccountOptions) {
  logAccountCleanup('start', {})

  // Push release needs a valid token, so it runs before signOut and before
  // the storage sweep — but a failure here must not strand the user signed in.
  try {
    await releasePushOnSignOut()
  } catch (error) {
    console.error('Failed to release push subscription during sign-out:', error instanceof Error ? error.message : 'unknown error')
  }

  // clearCalendarAccount stops the repository first, which is also what takes
  // its realtime subscriptions down while the session is still valid.
  const result = await runAccountCleanup(buildAccountCleanupSteps(userId, [
    { name: 'calendar-provider', run: clearCalendarAccount },
  ]))

  if (result.failed.length > 0 || result.timedOut.length > 0) {
    console.error('Account cleanup did not fully complete:', {
      failed: result.failed.map(({ step }) => step),
      timedOut: result.timedOut,
    })
  }
  logAccountCleanup('end', {
    completed: result.completed.length,
    failed: result.failed.length,
    timedOut: result.timedOut.length,
  })

  const { error } = await supabase.auth.signOut()
  if (error) throw error

  // Auth lives at the root route. replaceState also prevents the browser back
  // button from reopening the previously protected URL after sign-out.
  if (typeof window !== 'undefined') window.history.replaceState(null, '', '/')
}
