/**
 * Shared scaffolding for the per-feature domain error modules (MealsError,
 * FamilyError, ...). Every one of them wraps a raw Supabase failure the same
 * way: a class carrying a classified {@link AppErrorCode}, the operation that
 * failed, and a retryability flag, plus a converter that classifies the error
 * and lets the domain refine the code before constructing it.
 *
 * Keeping that shape in one place means the classification and re-wrapping
 * rules — especially "a domain error is never re-classified" — cannot drift
 * between features.
 */
import { classifyAppError, isRetryableErrorCode, type AppErrorCode } from './errorCodes'

/** Reads a `message` off any thrown value without assuming it is an `Error`. */
export function extractErrorMessage(error: unknown): string {
  return error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : ''
}

/**
 * Base class for a feature's error type. Subclasses fix the human-facing
 * `name` and the `prefix` used in the diagnostic message so the concrete type
 * reads, e.g., `meals:meals.list:not-found`.
 */
export abstract class DomainError<Operation extends string> extends Error {
  readonly code: AppErrorCode
  readonly operation: Operation
  readonly retryable: boolean

  constructor(name: string, prefix: string, operation: Operation, code: AppErrorCode, cause?: unknown) {
    super(`${prefix}:${operation}:${code}`)
    this.name = name
    this.operation = operation
    this.code = code
    this.retryable = isRetryableErrorCode(code)
    this.cause = cause
  }
}

/**
 * A domain hook that adjusts the classified code for operation-specific cases
 * (a stale row that should read as a `conflict` rather than `not-found`, ...).
 */
export type RefineErrorCode<Operation extends string> = (
  operation: Operation,
  code: AppErrorCode,
  error: unknown,
) => AppErrorCode

/**
 * Builds the `to<Feature>Error` converter. It never re-wraps an error the same
 * class already produced, classifies with the browser's connectivity taken
 * into account, and applies the optional `refine` before constructing.
 */
export function createDomainErrorConverter<Operation extends string, E extends DomainError<Operation>>(
  ErrorClass: new (operation: Operation, code: AppErrorCode, cause?: unknown) => E,
  refine?: RefineErrorCode<Operation>,
): (operation: Operation, error: unknown) => E {
  return (operation, error) => {
    if (error instanceof ErrorClass) return error
    const browserOnline = typeof navigator === 'undefined' ? undefined : navigator.onLine !== false
    const code = classifyAppError(error, { browserOnline })
    return new ErrorClass(operation, refine ? refine(operation, code, error) : code, error)
  }
}
