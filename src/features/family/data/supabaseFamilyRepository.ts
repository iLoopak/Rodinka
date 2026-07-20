import { supabase } from '../../../supabaseClient'
import { createRealtimeSubscription } from '../../../realtime/createRealtimeSubscription'
import type { FamilyMember } from '../../../hooks/useFamilyMembers'
import { toFamilyError, type FamilyOperation } from '../domain/familyErrors'
import { FAMILY_SETTINGS_COLUMNS, MEMBER_COLUMNS, mapFamilySettings, mapMember } from '../domain/familyMappers'
import { SupabaseFamilyMediaStorage, type FamilyMediaStorage } from './familyMediaStorage'
import type {
  FamilyMembersRealtimeHandlers,
  FamilyMembersRepository,
  FamilyScope,
  FamilySettingsPatch,
  FamilySettingsRealtimeHandlers,
  FamilySettingsRepository,
  MemberProfilePatch,
  MemberRemovalStrategy,
} from './familyRepository'

type Row = Record<string, unknown>

async function run<T>(operation: FamilyOperation, work: () => PromiseLike<{ data: unknown; error: unknown }>, map: (data: unknown) => T): Promise<T> {
  let result: { data: unknown; error: unknown }
  try {
    result = await work()
  } catch (error) {
    throw toFamilyError(operation, error)
  }
  if (result.error) throw toFamilyError(operation, result.error)
  return map(result.data)
}

const rows = (data: unknown): Row[] => Array.isArray(data) ? (data as Row[]) : []

export class SupabaseFamilyMembersRepository implements FamilyMembersRepository {
  private readonly storage: FamilyMediaStorage

  constructor(storage: FamilyMediaStorage = new SupabaseFamilyMediaStorage()) {
    this.storage = storage
  }

  /** Signs every avatar in one batch rather than one request per member. */
  private async withAvatars(members: FamilyMember[]) {
    const paths = [...new Set(members.map((member) => member.avatar_path).filter((path): path is string => Boolean(path)))]
    if (paths.length === 0) return members
    const signed = await this.storage.signAvatars(paths)
    return members.map((member) => ({
      ...member,
      avatar_url: member.avatar_path ? signed.get(member.avatar_path) ?? null : null,
    }))
  }

  async listMembers(scope: FamilyScope) {
    const members = await run('family.listMembers',
      () => supabase.from('members').select(MEMBER_COLUMNS).eq('family_id', scope.familyId).order('display_name'),
      (data) => rows(data).map((row) => mapMember(row)))
    return this.withAvatars(members)
  }

  async getMember(scope: FamilyScope, id: string) {
    const member = await run('family.listMembers',
      () => supabase.from('members').select(MEMBER_COLUMNS).eq('id', id).eq('family_id', scope.familyId).single(),
      (data) => mapMember(data as Row))
    const [signed] = await this.withAvatars([member])
    return signed
  }

  async createChild(scope: FamilyScope, displayName: string, colorKey: FamilyMember['color_key']) {
    return run('family.createMember',
      () => supabase.from('members')
        .insert({ family_id: scope.familyId, display_name: displayName, role: 'child', color_key: colorKey })
        .select(MEMBER_COLUMNS).single(),
      (data) => mapMember(data as Row))
  }

  async deleteMemberRow(scope: FamilyScope, id: string) {
    await run('family.deleteMember',
      () => supabase.from('members').delete().eq('id', id).eq('family_id', scope.familyId),
      () => undefined)
  }

  async updateProfile(scope: FamilyScope, memberId: string, patch: MemberProfilePatch) {
    await run('family.updateProfile',
      () => supabase.rpc('update_member_profile', {
        p_target_member_id: memberId,
        p_display_name: patch.displayName,
        p_birth_date: patch.birthDate,
        p_color_key: patch.colorKey,
        p_custom_color: patch.customColor ?? null,
        p_avatar_path: patch.avatarPath,
        p_grammatical_gender: patch.grammaticalGender,
        p_vocative_name: patch.vocativeName,
      }),
      () => undefined)
    // The RPC returns nothing, so the updated member is read back — one row,
    // not the whole roster.
    return this.getMember(scope, memberId)
  }

  async removeMember(memberId: string, strategy: MemberRemovalStrategy, allowSelf: boolean) {
    await run('family.removeMember',
      () => supabase.rpc('remove_household_member', {
        p_member_id: memberId,
        p_replacement_member_id: strategy.replacementMemberId,
        p_task_strategy: strategy.taskStrategy,
        p_activity_strategy: strategy.activityStrategy,
        p_reason: strategy.reason || null,
        p_allow_self: allowSelf,
      }),
      () => undefined)
  }

  async restoreMember(memberId: string) {
    await run('family.restoreMember',
      () => supabase.rpc('restore_household_member', { p_member_id: memberId }),
      () => undefined)
  }

  async permanentlyDeleteMember(memberId: string) {
    return run('family.deleteMember',
      () => supabase.rpc('permanently_delete_removed_member', { p_member_id: memberId }),
      (data) => {
        const avatarPath = data && typeof data === 'object' && 'avatar_path' in data
          ? String((data as { avatar_path: unknown }).avatar_path ?? '')
          : ''
        return { avatarPath: avatarPath || null }
      })
  }

  async createInvite(scope: FamilyScope) {
    const code = await run('family.createInvite',
      () => supabase.rpc('create_invite', { fid: scope.familyId }),
      (data) => String(data))
    // Best effort: the expiry is display-only, and a failure here must not
    // lose the code the user is waiting for.
    const { data: invite } = await supabase.from('invites').select('expires_at').eq('code', code).single()
    return { code, expiresAt: (invite?.expires_at as string | null) ?? null }
  }

  async listMemberEmails(scope: FamilyScope) {
    return run('family.memberEmails',
      () => supabase.rpc('family_member_emails', { p_family_id: scope.familyId }),
      (data) => Object.fromEntries(rows(data).map((row) => [String(row.member_id), String(row.email)])))
  }

  subscribe(scope: FamilyScope, handlers: FamilyMembersRealtimeHandlers) {
    return createRealtimeSubscription({
      channelName: `family:${scope.familyId}:family-members`,
      owner: 'FamilyMembersRepository',
      openReason: 'provider-mount',
      onStatusChange: handlers.onStatusChange,
      tables: [{
        table: 'members',
        filter: `family_id=eq.${scope.familyId}`,
        // A members row carries avatar_path, never a signed URL, so each
        // change is signed before it reaches state — otherwise avatars would
        // render broken until the next full refresh.
        onInsert: (row) => { void this.signRow(row).then((member) => handlers.onMemberChange({ action: 'upsert', record: member })) },
        onUpdate: (row) => { void this.signRow(row).then((member) => handlers.onMemberChange({ action: 'upsert', record: member })) },
        onDelete: (row) => handlers.onMemberChange({ action: 'delete', id: String(row.id) }),
      }],
    })
  }

  private async signRow(row: Row) {
    const member = mapMember(row)
    if (!member.avatar_path) return member
    return { ...member, avatar_url: await this.storage.signAvatar(member.avatar_path) }
  }
}

export class SupabaseFamilySettingsRepository implements FamilySettingsRepository {
  private readonly storage: FamilyMediaStorage

  constructor(storage: FamilyMediaStorage = new SupabaseFamilyMediaStorage()) {
    this.storage = storage
  }

  async loadSettings(scope: FamilyScope) {
    const row = await run('family.loadSettings',
      () => supabase.from('families').select(FAMILY_SETTINGS_COLUMNS).eq('id', scope.familyId).single(),
      (data) => data as Row)
    const heroPath = typeof row.hero_image_path === 'string' && row.hero_image_path ? row.hero_image_path : null
    return mapFamilySettings(row, heroPath ? await this.storage.signHeroImage(heroPath) : null)
  }

  async updateSettings(scope: FamilyScope, patch: FamilySettingsPatch) {
    const payload: Row = {}
    if (patch.name !== undefined) payload.name = patch.name
    if (patch.heroImagePath !== undefined) payload.hero_image_path = patch.heroImagePath
    if (patch.shoppingCategorySettings !== undefined) payload.shopping_category_settings = patch.shoppingCategorySettings
    if (Object.keys(payload).length === 0) return
    await run('family.updateSettings',
      () => supabase.from('families').update(payload).eq('id', scope.familyId),
      () => undefined)
  }

  subscribe(scope: FamilyScope, handlers: FamilySettingsRealtimeHandlers) {
    return createRealtimeSubscription({
      channelName: `family:${scope.familyId}:family-settings`,
      owner: 'FamilySettingsRepository',
      openReason: 'provider-mount',
      onStatusChange: handlers.onStatusChange,
      tables: [{
        table: 'families',
        filter: `id=eq.${scope.familyId}`,
        // One row per family; INSERT and DELETE never happen in normal use.
        onUpdate: (row) => handlers.onSettingsChange(row),
      }],
    })
  }
}
