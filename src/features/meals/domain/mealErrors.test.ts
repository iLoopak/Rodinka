import { describe, expect, it } from 'vitest'
import { MealsError, toMealsError } from './mealErrors'

describe('MealsError', () => {
  it('carries the operation, code, cause, and a stable message shape', () => {
    const cause = new Error('raw')
    const error = new MealsError('meals.create', 'mutation-failed', cause)
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('MealsError')
    expect(error.operation).toBe('meals.create')
    expect(error.code).toBe('mutation-failed')
    expect(error.cause).toBe(cause)
    expect(error.message).toBe('meals:meals.create:mutation-failed')
  })

  it('derives retryability from the error code', () => {
    expect(new MealsError('meals.list', 'backend-unavailable').retryable).toBe(true)
    expect(new MealsError('meals.list', 'permission-denied').retryable).toBe(false)
    expect(new MealsError('meals.list', 'conflict').retryable).toBe(false)
  })
})

describe('toMealsError', () => {
  it('returns an existing MealsError untouched', () => {
    const original = new MealsError('plan.update', 'conflict')
    expect(toMealsError('plan.list', original)).toBe(original)
  })

  it('classifies an authorization failure as a non-retryable permission error', () => {
    const error = toMealsError('meals.list', { code: '42501', message: 'row-level security' })
    expect(error.code).toBe('permission-denied')
    expect(error.retryable).toBe(false)
    expect(error.operation).toBe('meals.list')
  })

  it('classifies a timeout as retryable', () => {
    const error = toMealsError('plan.list', { message: 'Request timed out' })
    expect(error.code).toBe('request-timeout')
    expect(error.retryable).toBe(true)
  })

  it('preserves the original error as the cause', () => {
    const raw = { code: '42501', message: 'permission denied' }
    expect(toMealsError('meals.update', raw).cause).toBe(raw)
  })

  it('refines a "round is not open" mutation on a voting op into a conflict', () => {
    for (const message of ['Vote round is not open', 'the round is already closed', 'not open']) {
      const error = toMealsError('voting.castVote', { code: 'P0001', message })
      expect(error.code).toBe('conflict')
      expect(error.retryable).toBe(false)
    }
  })

  it('leaves the same failure as a plain mutation failure outside voting', () => {
    const error = toMealsError('plan.create', { code: 'P0001', message: 'round is not open' })
    expect(error.code).toBe('mutation-failed')
  })

  it('does not refine a voting failure that is not a closed-round conflict', () => {
    const error = toMealsError('voting.castVote', { code: 'P0001', message: 'unexpected trigger failure' })
    expect(error.code).toBe('mutation-failed')
  })
})
