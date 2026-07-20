import { supabase } from '../../../supabaseClient'
import { toFamilyError } from '../domain/familyErrors'

/**
 * The only place that talks to the two family storage buckets.
 *
 * Signing, uploading and deleting were previously spread across
 * FamilyMembersContext, useMemberProfiles, useFamilyMembers and
 * FamilySettingsContext, each with its own error handling and its own idea of
 * how long a URL should live. The lifetimes in particular have to agree with
 * the query cache: `signedUrlMaxAgeMs` derives the cache max age from these
 * constants, so a cached payload always expires before the URLs inside it.
 */
export const AVATAR_SIGNED_URL_SECONDS = 12 * 60 * 60
export const FAMILY_HERO_SIGNED_URL_SECONDS = 12 * 60 * 60

const MEMBER_AVATARS = 'member-avatars'
const FAMILY_HERO_IMAGES = 'family-hero-images'

export interface FamilyMediaStorage {
  signAvatar(path: string): Promise<string | null>
  signAvatars(paths: string[]): Promise<Map<string, string>>
  uploadAvatar(path: string, file: File): Promise<void>
  removeAvatar(path: string): Promise<void>
  signHeroImage(path: string): Promise<string | null>
  uploadHeroImage(path: string, file: File): Promise<void>
  removeHeroImage(path: string): Promise<void>
}

export class SupabaseFamilyMediaStorage implements FamilyMediaStorage {
  /**
   * A failure to sign is not a failure to load the member: the row is still
   * valid, the avatar just will not render. Callers get null and carry on.
   */
  async signAvatar(path: string) {
    const { data, error } = await supabase.storage.from(MEMBER_AVATARS).createSignedUrl(path, AVATAR_SIGNED_URL_SECONDS)
    if (error) {
      console.error('Failed to sign member avatar:', error.message)
      return null
    }
    return data.signedUrl
  }

  async signAvatars(paths: string[]) {
    if (paths.length === 0) return new Map<string, string>()
    const { data, error } = await supabase.storage.from(MEMBER_AVATARS).createSignedUrls(paths, AVATAR_SIGNED_URL_SECONDS)
    if (error) {
      console.error('Failed to create member avatar signed URLs:', error.message)
      return new Map<string, string>()
    }
    const signed = new Map<string, string>()
    for (const entry of data ?? []) {
      if (typeof entry.path === 'string' && typeof entry.signedUrl === 'string') signed.set(entry.path, entry.signedUrl)
    }
    return signed
  }

  async uploadAvatar(path: string, file: File) {
    const { error } = await supabase.storage.from(MEMBER_AVATARS).upload(path, file, {
      cacheControl: '3600', contentType: file.type, upsert: false,
    })
    if (error) throw toFamilyError('family.uploadAvatar', error)
  }

  /** Best effort: an orphaned object is cheaper than a failed user action. */
  async removeAvatar(path: string) {
    const { error } = await supabase.storage.from(MEMBER_AVATARS).remove([path])
    if (error) console.error('Failed to remove member avatar:', error.message)
  }

  async signHeroImage(path: string) {
    const { data, error } = await supabase.storage.from(FAMILY_HERO_IMAGES).createSignedUrl(path, FAMILY_HERO_SIGNED_URL_SECONDS)
    if (error) {
      console.error('Failed to sign family hero image:', error.message)
      return null
    }
    return data.signedUrl
  }

  async uploadHeroImage(path: string, file: File) {
    const { error } = await supabase.storage.from(FAMILY_HERO_IMAGES).upload(path, file, {
      cacheControl: '3600', contentType: file.type, upsert: false,
    })
    if (error) throw toFamilyError('family.uploadHeroImage', error)
  }

  async removeHeroImage(path: string) {
    const { error } = await supabase.storage.from(FAMILY_HERO_IMAGES).remove([path])
    if (error) console.error('Failed to remove family hero image:', error.message)
  }
}
