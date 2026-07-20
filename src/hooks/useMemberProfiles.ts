import { useCallback, useMemo } from 'react'
import { SupabaseFamilyMediaStorage } from '../features/family/data/familyMediaStorage'
import { SupabaseFamilyMembersRepository } from '../features/family/data/supabaseFamilyRepository'
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
  customColor?: string | null
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

export function useMemberProfiles(refreshMembers: () => Promise<void>) {
  const storage = useMemo(() => new SupabaseFamilyMediaStorage(), [])
  const repository = useMemo(() => new SupabaseFamilyMembersRepository(storage), [storage])

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
        try {
          await storage.uploadAvatar(uploadedPath, optimized)
        } catch (uploadError) {
          console.error('Failed to upload member avatar:', uploadError instanceof Error ? uploadError.message : 'unknown error')
          throw new MemberProfileError('upload_failed')
        }
        nextAvatarPath = uploadedPath
      }

      try {
        await repository.updateProfile({ familyId: member.family_id }, member.id, {
          displayName: input.displayName,
          birthDate: input.birthDate,
          colorKey: input.colorKey,
          customColor: input.customColor ?? null,
          grammaticalGender: input.grammaticalGender,
          vocativeName: input.vocativeName?.trim().replace(/\s+/g, ' ') || null,
          avatarPath: nextAvatarPath,
        })
      } catch (profileError) {
        console.error('Failed to update member profile:', profileError instanceof Error ? profileError.message : 'unknown error')
        // The upload happened before the row was updated, so an orphan is
        // possible; removing it is best effort and never fails the action.
        if (uploadedPath) await storage.removeAvatar(uploadedPath)
        throw new MemberProfileError('save_failed')
      }

      await refreshMembers()

      if (member.avatar_path && member.avatar_path !== nextAvatarPath) {
        await storage.removeAvatar(member.avatar_path)
      }
    },
    [refreshMembers, repository, storage]
  )

  return { saveMemberProfile }
}
