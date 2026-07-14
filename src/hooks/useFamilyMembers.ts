import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { t } from '../strings'

export type MemberColorKey =
  | 'brick'
  | 'coral'
  | 'sky'
  | 'sage'
  | 'honey'
  | 'lavender'
  | 'berry'

export type GrammaticalGender = 'masculine' | 'feminine' | 'neutral'
export type MemberRole = 'admin' | 'parent' | 'child'

export interface FamilyMember {
  id: string
  family_id: string
  display_name: string
  role: MemberRole
  user_id: string | null
  birth_date: string | null
  color_key: MemberColorKey | null
  avatar_path: string | null
  avatar_url: string | null
  grammatical_gender: GrammaticalGender | null
}

const AVATAR_SIGNED_URL_SECONDS = 12 * 60 * 60

export function useFamilyMembers(familyId: string | undefined) {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!familyId) {
      setMembers([])
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error } = await supabase
      .from('members')
      .select('id, family_id, display_name, role, user_id, birth_date, color_key, avatar_path, grammatical_gender')
      .eq('family_id', familyId)
      .order('display_name')

    if (error) {
      console.error('Failed to load family members:', error.message)
      setMembers([])
      setError(t.errors.loadFailed)
    } else {
      const loadedMembers = (data ?? []).map((member) => ({ ...member, avatar_url: null })) as FamilyMember[]
      const avatarPaths = [...new Set(loadedMembers.flatMap((member) => member.avatar_path ?? []))]

      if (avatarPaths.length > 0) {
        const { data: signedUrls, error: signedUrlError } = await supabase.storage
          .from('member-avatars')
          .createSignedUrls(avatarPaths, AVATAR_SIGNED_URL_SECONDS)

        if (signedUrlError) {
          console.error('Failed to create member avatar signed URLs:', signedUrlError.message)
        } else {
          const urlByPath = new Map(
            (signedUrls ?? [])
              .filter((item) => item.signedUrl)
              .map((item) => [item.path, item.signedUrl] as const)
          )
          for (const member of loadedMembers) {
            member.avatar_url = member.avatar_path ? (urlByPath.get(member.avatar_path) ?? null) : null
          }
        }
      }

      setMembers(loadedMembers)
      setError(null)
    }
    setLoading(false)
  }, [familyId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { members, loading, error, refresh }
}
