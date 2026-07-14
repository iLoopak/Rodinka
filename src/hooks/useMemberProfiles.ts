import { useCallback } from 'react'
import { supabase } from '../supabaseClient'
import type { FamilyMember, GrammaticalGender, MemberColorKey } from './useFamilyMembers'
import {
  buildMemberAvatarPath,
  MEMBER_AVATAR_CROPPED_PREFIX,
  memberAvatarExtension,
  optimizeMemberAvatar,
  validateMemberAvatarFile,
  type AvatarValidationError,
} from '../utils/memberAvatarImage'

export interface MemberProfileInput {
  displayName: string
  birthDate: string | null
  colorKey: MemberColorKey | null
  grammaticalGender: GrammaticalGender | null
  vocativeName: string | null
  avatarFile: File | null
  removeAvatar: boolean
}

export type MemberProfileErrorCode = AvatarValidationError | 'upload_failed' | 'save_failed'

export class MemberProfileError extends Error {
  readonly code: MemberProfileErrorCode

  constructor(code: MemberProfileErrorCode) {
    super(code)
    this.code = code
  }
}

async function removeAvatarBestEffort(path: string, context: string) {
  const { error } = await supabase.storage.from('member-avatars').remove([path])
  if (error) console.error(`${context}:`, error.message)
}

export function useMemberProfiles(refreshMembers: () => Promise<void>) {
  const saveMemberProfile = useCallback(
    async (member: FamilyMember, input: MemberProfileInput) => {
      let nextAvatarPath = input.removeAvatar ? null : member.avatar_path
      let uploadedPath: string | null = null

      if (input.avatarFile) {
        const validationError = validateMemberAvatarFile(input.avatarFile)
        if (validationError) throw new MemberProfileError(validationError)

        let optimized: File
        try {
          optimized = input.avatarFile.name.startsWith(MEMBER_AVATAR_CROPPED_PREFIX)
            ? input.avatarFile
            : await optimizeMemberAvatar(input.avatarFile)
        } catch (error) {
          console.error('Failed to optimize member avatar:', error)
          throw new MemberProfileError('upload_failed')
        }

        uploadedPath = buildMemberAvatarPath(
          member.family_id,
          member.id,
          memberAvatarExtension(optimized.type)
        )
        const { error: uploadError } = await supabase.storage
          .from('member-avatars')
          .upload(uploadedPath, optimized, {
            cacheControl: '3600',
            contentType: optimized.type,
            upsert: false,
          })

        if (uploadError) {
          console.error('Failed to upload member avatar:', uploadError.message)
          throw new MemberProfileError('upload_failed')
        }
        nextAvatarPath = uploadedPath
      }

      const { error: profileError } = await supabase.rpc('update_member_profile', {
        p_target_member_id: member.id,
        p_display_name: input.displayName,
        p_birth_date: input.birthDate,
        p_color_key: input.colorKey,
        p_avatar_path: nextAvatarPath,
        p_grammatical_gender: input.grammaticalGender,
        p_vocative_name: input.vocativeName?.trim().replace(/\s+/g, ' ') || null,
      })

      if (profileError) {
        console.error('Failed to update member profile:', profileError.message)
        if (uploadedPath) await removeAvatarBestEffort(uploadedPath, 'Failed to roll back new avatar')
        throw new MemberProfileError('save_failed')
      }

      await refreshMembers()

      if (member.avatar_path && member.avatar_path !== nextAvatarPath) {
        await removeAvatarBestEffort(member.avatar_path, 'Failed to clean up previous avatar')
      }
    },
    [refreshMembers]
  )

  return { saveMemberProfile }
}
