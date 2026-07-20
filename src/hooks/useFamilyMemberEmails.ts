import { useCallback, useEffect, useState } from 'react'
import { SupabaseFamilyMembersRepository } from '../features/family/data/supabaseFamilyRepository'

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
    try {
      const data = await new SupabaseFamilyMembersRepository().listMemberEmails({ familyId })
      setEmails(new Map(Object.entries(data)))
      setError(null)
    } catch (loadError) {
      // A child or outsider is filtered out by returning no rows, not by an
      // error, so a failure here is a genuine fault rather than a permission
      // signal — surface it but keep the UI usable with an empty lookup.
      const message = loadError instanceof Error ? loadError.message : 'unknown error'
      console.error('Failed to load family member emails:', message)
      setEmails(new Map())
      setError(message)
    }
    setLoading(false)
  }, [enabled, familyId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { emails, loading, error, refresh }
}
