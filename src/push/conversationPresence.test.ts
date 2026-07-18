import { describe, expect, it } from 'vitest'
import { isPresent } from './conversationPresence'

describe('conversation presence rule', () => {
  it('counts a visible, focused, open conversation as present', () => {
    expect(isPresent({ conversationId: 'c1', visible: true, focused: true })).toBe(true)
  })

  it('does not count a background tab', () => {
    // A laptop left open on the family chat must not suppress the push that
    // the user's phone is waiting for.
    expect(isPresent({ conversationId: 'c1', visible: false, focused: true })).toBe(false)
  })

  it('does not count an unfocused window', () => {
    expect(isPresent({ conversationId: 'c1', visible: true, focused: false })).toBe(false)
  })

  it('is never present with no conversation open', () => {
    expect(isPresent({ conversationId: null, visible: true, focused: true })).toBe(false)
  })
})
