import type { FamilyMember } from '../../../hooks/useFamilyMembers'
import type { FamilySettings } from '../domain/familyMappers'

export interface FamilyScope {
  familyId: string
  userId?: string | null
}

export type MemberRemovalStrategy = {
  replacementMemberId: string | null
  taskStrategy: 'unassign' | 'reassign'
  activityStrategy: 'clear' | 'reassign'
  reason?: string
}

export interface MemberProfilePatch {
  displayName: string
  birthDate: string | null
  colorKey: FamilyMember['color_key']
  customColor?: string | null
  grammaticalGender: FamilyMember['grammatical_gender']
  vocativeName: string | null
  avatarPath: string | null
}

export type MemberRealtimeChange =
  | { action: 'upsert'; record: FamilyMember }
  | { action: 'delete'; id: string }

export interface FamilyMembersRealtimeHandlers {
  onMemberChange: (change: MemberRealtimeChange) => void
  onStatusChange: (status: string) => void
}

/**
 * The roster and everything that changes it. Avatar bytes are not this
 * repository's business — it deals in `avatar_path`, and the storage adapter
 * turns a path into a signed URL.
 */
export interface FamilyMembersRepository {
  listMembers(scope: FamilyScope): Promise<FamilyMember[]>
  getMember(scope: FamilyScope, id: string): Promise<FamilyMember>
  createChild(scope: FamilyScope, displayName: string, colorKey: FamilyMember['color_key']): Promise<FamilyMember>
  /** Deletes a member created moments ago, used to undo a failed avatar upload. */
  deleteMemberRow(scope: FamilyScope, id: string): Promise<void>
  updateProfile(scope: FamilyScope, memberId: string, patch: MemberProfilePatch): Promise<FamilyMember>
  removeMember(memberId: string, strategy: MemberRemovalStrategy, allowSelf: boolean): Promise<void>
  restoreMember(memberId: string): Promise<void>
  /** Returns the removed member's avatar path so the caller can clean it up. */
  permanentlyDeleteMember(memberId: string): Promise<{ avatarPath: string | null }>
  createInvite(scope: FamilyScope): Promise<{ code: string; expiresAt: string | null }>
  /** RPC-guarded: only returns contacts the caller is allowed to see. */
  listMemberEmails(scope: FamilyScope): Promise<Record<string, string>>
  subscribe(scope: FamilyScope, handlers: FamilyMembersRealtimeHandlers): () => void
}

export interface FamilySettingsPatch {
  name?: string
  heroImagePath?: string | null
  shoppingCategorySettings?: unknown
}

export interface FamilySettingsRealtimeHandlers {
  onSettingsChange: (row: Record<string, unknown>) => void
  onStatusChange: (status: string) => void
}

export interface FamilySettingsRepository {
  loadSettings(scope: FamilyScope): Promise<FamilySettings>
  updateSettings(scope: FamilyScope, patch: FamilySettingsPatch): Promise<void>
  subscribe(scope: FamilyScope, handlers: FamilySettingsRealtimeHandlers): () => void
}

/**
 * Joining or founding a family. Separate from the roster because it runs
 * before the caller has a family at all — the onboarding screen was calling
 * these two RPCs directly, the last data access left in a component.
 */
export interface FamilyOnboardingRepository {
  createFamily(input: { familyName: string; displayName: string }): Promise<void>
  redeemInvite(input: { code: string; displayName: string }): Promise<void>
}
