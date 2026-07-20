import type { FamilyMember, FamilyMemberStatus } from '../../../hooks/useFamilyMembers'

/**
 * One column list for `members`, shared by the roster read, the profile
 * mutations and the calendar snapshot. It was previously written out in four
 * places, one of which quietly omitted `status` — a row loaded through that
 * path defaulted to active regardless of whether the member had been removed.
 */
export const MEMBER_COLUMNS =
  'id, family_id, display_name, role, user_id, birth_date, color_key, custom_color, avatar_path, grammatical_gender, vocative_name, status, removed_at, removed_by_member_id, removal_reason'

export const FAMILY_SETTINGS_COLUMNS = 'name, hero_image_path, shopping_category_settings'

type Row = Record<string, unknown>

const text = (value: unknown): string => typeof value === 'string' ? value : ''
const nullableText = (value: unknown): string | null => typeof value === 'string' && value !== '' ? value : null

/**
 * `avatar_url` is never a column — it is a signed URL derived from
 * `avatar_path`. It is mapped to null here and filled in by whoever holds the
 * storage adapter, so a row can never arrive carrying a stale signature.
 */
export function mapMember(row: Row, avatarUrl: string | null = null): FamilyMember {
  return {
    id: text(row.id),
    family_id: text(row.family_id),
    display_name: text(row.display_name),
    role: (row.role ?? 'parent') as FamilyMember['role'],
    user_id: nullableText(row.user_id),
    birth_date: nullableText(row.birth_date),
    color_key: (nullableText(row.color_key) ?? null) as FamilyMember['color_key'],
    custom_color: nullableText(row.custom_color),
    avatar_path: nullableText(row.avatar_path),
    avatar_url: avatarUrl,
    grammatical_gender: (nullableText(row.grammatical_gender) ?? null) as FamilyMember['grammatical_gender'],
    vocative_name: nullableText(row.vocative_name),
    // A missing status means active. Removed members carry it explicitly, and
    // treating an absent value as anything else would hide people who are
    // still in the family.
    status: ((row.status as FamilyMemberStatus | undefined) ?? 'active'),
    removed_at: nullableText(row.removed_at),
    removed_by_member_id: nullableText(row.removed_by_member_id),
    removal_reason: nullableText(row.removal_reason),
  }
}

export interface FamilySettings {
  name: string | null
  heroImagePath: string | null
  heroImageUrl: string | null
  shoppingCategorySettingsRaw: unknown
}

export function mapFamilySettings(row: Row, heroImageUrl: string | null): FamilySettings {
  return {
    name: nullableText(row.name),
    heroImagePath: nullableText(row.hero_image_path),
    heroImageUrl,
    shoppingCategorySettingsRaw: row.shopping_category_settings ?? null,
  }
}
