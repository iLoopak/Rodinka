import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../supabase/migrations/20260714001000_shared_shopping_list.sql', import.meta.url), 'utf8')

describe('shared shopping migration', () => {
  it('creates family-scoped shopping and ingredient tables with RLS', () => {
    expect(sql).toContain('create table shopping_items')
    expect(sql).toContain('create table meal_ingredients')
    expect(sql).toContain('alter table shopping_items enable row level security')
    expect(sql).toContain('is_family_member(family_id)')
  })

  it('validates cross-family member and source references', () => {
    expect(sql).toContain('Responsible member must belong to the shopping item family')
    expect(sql).toContain('Source meal must belong to the shopping item family')
    expect(sql).toContain('Source plan entry must belong to the shopping item family')
  })

  it('implements atomic duplicate, purchase and batch workflows', () => {
    expect(sql).toContain('create or replace function add_shopping_item')
    expect(sql).toContain("'action', 'merged'")
    expect(sql).toContain('create or replace function set_shopping_item_purchased')
    expect(sql).toContain('create or replace function import_shopping_items')
  })
})
