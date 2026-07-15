import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../supabase/migrations/20260714190000_family_hero_image.sql', import.meta.url), 'utf8')

describe('family hero image migration', () => {
  it('adds a private family-scoped hero image', () => {
    expect(sql).toContain('add column if not exists hero_image_path text')
    expect(sql).toContain("'family-hero-images'")
    expect(sql).toContain('public = false')
    expect(sql).toContain('public.can_read_family_hero_image(name)')
  })

  it('limits image management to active family administrators', () => {
    expect(sql).toContain("actor.role = 'admin'")
    expect(sql).toContain("coalesce(actor.status, 'active') = 'active'")
    expect(sql).toContain('public.can_manage_family_hero_image(name)')
  })
})
