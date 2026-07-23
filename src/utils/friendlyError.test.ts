import { describe, expect, it, vi } from 'vitest'
import { t } from '../strings'
import { friendly } from './friendlyError'

describe('friendly', () => {
  it('always returns a generic, user-safe Error regardless of the input shape', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const input of [
      new Error('constraint "x" violated'),
      { message: 'raw postgrest text' },
      'a bare string',
      42,
      null,
      undefined,
    ]) {
      const result = friendly(input)
      expect(result).toBeInstanceOf(Error)
      expect(result.message).toBe(t.errors.generic)
    }
    logged.mockRestore()
  })

  it('logs the underlying message for developers without leaking it to the caller', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = friendly(new Error('duplicate key value violates unique constraint'))
    expect(result.message).not.toContain('constraint')
    expect(logged).toHaveBeenCalledWith('duplicate key value violates unique constraint')
    logged.mockRestore()
  })

  it('reads the message off a plain error-like object', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    friendly({ message: 'PGRST116' })
    expect(logged).toHaveBeenCalledWith('PGRST116')
    logged.mockRestore()
  })

  it('stringifies a non-object, non-error value for the log', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    friendly('boom')
    expect(logged).toHaveBeenCalledWith('boom')
    logged.mockRestore()
  })

  it('describes a nullish value as an unknown error in the log', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    friendly(null)
    expect(logged).toHaveBeenCalledWith('unknown error')
    logged.mockRestore()
  })
})
