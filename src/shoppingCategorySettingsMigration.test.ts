import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../supabase/migrations/20260714180000_shopping_category_settings.sql', import.meta.url), 'utf8')

describe('shopping category settings migration', () => {
  it('adds backward-compatible family-scoped JSON settings', () => {
    expect(sql).toContain('add column if not exists shopping_category_settings jsonb')
    expect(sql).toContain("default '{}'::jsonb")
    expect(sql).toContain('families_shopping_category_settings_shape')
  })

  it('allows only the stable shopping category keys', () => {
    for (const category of ['produce', 'bakery', 'meat', 'dairy', 'household', 'pharmacy', 'other']) {
      expect(sql).toContain(`- '${category}'`)
    }
  })
})
