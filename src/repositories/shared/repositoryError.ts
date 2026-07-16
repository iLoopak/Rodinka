export type RepositoryErrorCode = 'network' | 'permission' | 'conflict' | 'validation' | 'not-found' | 'unknown'

export class RepositoryError extends Error {
  readonly code: RepositoryErrorCode
  readonly cause?: unknown

  constructor(message: string, code: RepositoryErrorCode = 'unknown', cause?: unknown) {
    super(message)
    this.name = 'RepositoryError'
    this.code = code
    this.cause = cause
  }
}

interface ErrorLike { message?: string; code?: string; status?: number }

export function normalizeRepositoryError(error: unknown, fallback = 'Repository operation failed'): RepositoryError {
  if (error instanceof RepositoryError) return error
  const details = error as ErrorLike
  const message = details?.message ?? fallback
  const lower = message.toLowerCase()
  let code: RepositoryErrorCode = 'unknown'
  if (details?.status === 401 || details?.status === 403 || lower.includes('permission') || lower.includes('rls')) code = 'permission'
  else if (details?.status === 404 || lower.includes('not found')) code = 'not-found'
  else if (details?.code === '23505' || lower.includes('duplicate') || lower.includes('conflict')) code = 'conflict'
  else if (details?.code?.startsWith('22') || details?.code === '23502' || lower.includes('invalid')) code = 'validation'
  else if (lower.includes('network') || lower.includes('fetch')) code = 'network'
  return new RepositoryError(fallback, code, error)
}

export function throwRepositoryError(error: unknown, fallback?: string): never {
  console.error(fallback ?? 'Repository operation failed', error)
  throw normalizeRepositoryError(error, fallback)
}
