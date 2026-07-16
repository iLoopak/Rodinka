import { describe, expect, it } from 'vitest'
import { normalizeRepositoryError, RepositoryError } from './repositoryError'

describe('normalizeRepositoryError', () => {
  it('returns safe structured permission errors', () => {
    const error = normalizeRepositoryError({ message: 'RLS denied', status: 403 }, 'Save failed')
    expect(error).toBeInstanceOf(RepositoryError)
    expect(error.message).toBe('Save failed')
    expect(error.code).toBe('permission')
  })

  it('normalizes duplicate writes as conflicts', () => {
    expect(normalizeRepositoryError({ code: '23505' }, 'Create failed').code).toBe('conflict')
  })
})
