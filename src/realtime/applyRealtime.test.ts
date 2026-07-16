import { describe, expect, it } from 'vitest'
import { applyRealtimeInsert } from './applyRealtimeInsert'
import { applyRealtimeUpdate } from './applyRealtimeUpdate'
import { applyRealtimeDelete } from './applyRealtimeDelete'

interface Item { id: string; name: string }

describe('applyRealtimeInsert', () => {
  it('appends a new row', () => {
    const items: Item[] = [{ id: '1', name: 'a' }]
    expect(applyRealtimeInsert(items, { id: '2', name: 'b' })).toEqual([{ id: '1', name: 'a' }, { id: '2', name: 'b' }])
  })

  it('ignores a row that already exists (dedupes the realtime echo of a local mutation)', () => {
    const items: Item[] = [{ id: '1', name: 'a' }]
    const result = applyRealtimeInsert(items, { id: '1', name: 'a' })
    expect(result).toBe(items) // same reference: no-op, no unnecessary re-render
    expect(result).toEqual([{ id: '1', name: 'a' }])
  })
})

describe('applyRealtimeUpdate', () => {
  it('replaces only the matching entity, leaving others untouched', () => {
    const items: Item[] = [{ id: '1', name: 'a' }, { id: '2', name: 'b' }]
    const result = applyRealtimeUpdate(items, { id: '2', name: 'b-updated' })
    expect(result).toEqual([{ id: '1', name: 'a' }, { id: '2', name: 'b-updated' }])
    expect(result[0]).toBe(items[0]) // untouched entity keeps its reference
  })

  it('appends the row if it was not already present (out-of-order insert/update)', () => {
    const items: Item[] = [{ id: '1', name: 'a' }]
    expect(applyRealtimeUpdate(items, { id: '2', name: 'b' })).toEqual([{ id: '1', name: 'a' }, { id: '2', name: 'b' }])
  })
})

describe('applyRealtimeDelete', () => {
  it('removes the matching entity', () => {
    const items: Item[] = [{ id: '1', name: 'a' }, { id: '2', name: 'b' }]
    expect(applyRealtimeDelete(items, '1')).toEqual([{ id: '2', name: 'b' }])
  })

  it('is a no-op when the id is not present', () => {
    const items: Item[] = [{ id: '1', name: 'a' }]
    const result = applyRealtimeDelete(items, '2')
    expect(result).toEqual(items)
  })
})
