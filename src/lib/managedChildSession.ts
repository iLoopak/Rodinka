import type { Session } from '@supabase/supabase-js'

export function isManagedChildSession(session: Session | null | undefined): boolean {
  return session?.user.app_metadata?.account_type === 'managed_child'
}
