import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

interface MemberEmailRow {
  member_id: string
  email: string
}

// Registered account emails for the adults of a family, keyed by member id.
// The data comes from the `family_member_emails` RPC, which is security-definer
// and only returns rows when the caller is an active adult of that family and
// only for adult members (see the migration). Children never carry an entry
// here, so an empty lookup for a member means "no account email to show", which
// the UI renders as a subtle placeholder.
export function useFamilyMemberEmails(familyId: string | undefined, enabled: boolean) {
  const [emails, setEmails] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!enabled || !familyId) {
      setEmails(new Map())
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error: loadError } = await supabase.rpc('family_member_emails', { p_family_id: familyId })
    if (loadError) {
      // A child or outsider is filtered out by returning no rows, not by an
      // error, so a failure here is a genuine fault rather than a permission
      // signal — surface it but keep the UI usable with an empty lookup.
      console.error('Failed to load family member emails:', loadError.message)
      setEmails(new Map())
      setError(loadError.message)
    } else {
      setEmails(new Map((data ?? []).map((row: MemberEmailRow) => [row.member_id, row.email])))
      setError(null)
    }
    setLoading(false)
  }, [enabled, familyId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { emails, loading, error, refresh }
}
