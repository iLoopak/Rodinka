import { describe, expect, it } from 'vitest'
import { insertIdBefore, moveIdBefore, moveIdToEnd } from './listReorder'

describe('persistent list reordering', () => {
  it('moves an item before another item without losing IDs', () => {
    expect(moveIdBefore(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b'])
  })

  it('moves an item to the end', () => {
    expect(moveIdToEnd(['a', 'b', 'c'], 'a')).toEqual(['b', 'c', 'a'])
  })

  it('inserts a cross-section item at the requested target', () => {
    expect(insertIdBefore(['milk', 'bread'], 'apples', 'bread')).toEqual(['milk', 'apples', 'bread'])
    expect(insertIdBefore(['milk'], 'apples', null)).toEqual(['milk', 'apples'])
  })
})
