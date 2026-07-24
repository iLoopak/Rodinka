import { describe, expect, it } from 'vitest'
import { createDomainErrorConverter, DomainError, extractErrorMessage } from './domainError'
import type { AppErrorCode } from './errorCodes'

type SampleOperation = 'sample.read' | 'sample.write'

class SampleError extends DomainError<SampleOperation> {
  constructor(operation: SampleOperation, code: AppErrorCode, cause?: unknown) {
    super('SampleError', 'sample', operation, code, cause)
  }
}

describe('extractErrorMessage', () => {
  it('reads a message off any object without assuming an Error instance', () => {
    expect(extractErrorMessage({ message: 'boom' })).toBe('boom')
    expect(extractErrorMessage(new Error('kaboom'))).toBe('kaboom')
  })

  it('returns an empty string for values that carry no message', () => {
    expect(extractErrorMessage(null)).toBe('')
    expect(extractErrorMessage('plain string')).toBe('')
  })
})

describe('DomainError', () => {
  it('exposes the classified code, operation, retryability and diagnostic message', () => {
    const cause = new Error('raw')
    const error = new SampleError('sample.read', 'backend-unavailable', cause)
    expect(error.name).toBe('SampleError')
    expect(error.operation).toBe('sample.read')
    expect(error.code).toBe('backend-unavailable')
    expect(error.retryable).toBe(true)
    expect(error.message).toBe('sample:sample.read:backend-unavailable')
    expect(error.cause).toBe(cause)
  })

  it('marks non-transient codes as not retryable', () => {
    expect(new SampleError('sample.write', 'permission-denied').retryable).toBe(false)
  })
})

describe('createDomainErrorConverter', () => {
  const toSampleError = createDomainErrorConverter(SampleError)

  it('classifies a raw failure into the domain error', () => {
    const error = toSampleError('sample.read', { code: '42501', message: 'row-level security' })
    expect(error).toBeInstanceOf(SampleError)
    expect(error.code).toBe('permission-denied')
    expect(error.message).not.toContain('row-level security')
  })

  it('never re-wraps an error it already produced', () => {
    const first = toSampleError('sample.read', new Error('boom'))
    expect(toSampleError('sample.write', first)).toBe(first)
  })

  it('applies the domain refinement before constructing', () => {
    const refine = (operation: SampleOperation, code: AppErrorCode): AppErrorCode =>
      operation === 'sample.write' && code === 'not-found' ? 'conflict' : code
    const toRefined = createDomainErrorConverter(SampleError, refine)
    expect(toRefined('sample.write', { code: 'PGRST116', message: 'no rows' }).code).toBe('conflict')
    expect(toRefined('sample.read', { code: 'PGRST116', message: 'no rows' }).code).toBe('not-found')
  })
})
