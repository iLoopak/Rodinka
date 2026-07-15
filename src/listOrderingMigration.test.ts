import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../supabase/migrations/20260714170000_list_sort_order.sql', import.meta.url), 'utf8').toLowerCase()

describe('shared list ordering migration', () => {
  it('adds stable ordering to both existing entities', () => {
    expect(sql).toContain('alter table public.chores')
    expect(sql).toContain('alter table public.shopping_items')
    expect(sql.match(/add column if not exists sort_order/g)).toHaveLength(2)
  })

  it('keeps shopping category moves and task ordering transactional and authorized', () => {
    expect(sql).toContain('reorder_household_tasks')
    expect(sql).toContain('reorder_shopping_items')
    expect(sql).toContain("role in ('admin', 'parent')")
    expect(sql).toContain('is_family_member(p_family_id)')
    expect(sql).toContain('security definer')
  })
})
