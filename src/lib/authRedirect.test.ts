import { describe, expect, it } from 'vitest'
import { getAuthRedirectUrl } from './authRedirect'

describe('getAuthRedirectUrl', () => {
  it('preserves a deep link through an OAuth round trip', () => {
    expect(getAuthRedirectUrl({
      origin: 'https://rodinka.example',
      pathname: '/chores',
      search: '?chore=123e4567-e89b-42d3-a456-426614174000',
      hash: '',
    })).toBe('https://rodinka.example/chores?chore=123e4567-e89b-42d3-a456-426614174000')
  })
})
