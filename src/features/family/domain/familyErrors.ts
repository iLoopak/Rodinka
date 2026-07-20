import { classifyAppError, isRetryableErrorCode, type AppErrorCode } from '../../../errors/errorCodes'

export type FamilyOperation =
  | 'family.listMembers'
  | 'family.createMember'
  | 'family.updateProfile'
  | 'family.removeMember'
  | 'family.restoreMember'
  | 'family.deleteMember'
  | 'family.createInvite'
  | 'family.loadSettings'
  | 'family.updateSettings'
  | 'family.uploadAvatar'
  | 'family.uploadHeroImage'
  | 'family.memberEmails'
  | 'family.createFamily'
  | 'family.redeemInvite'

export class FamilyError extends Error {
  readonly code: AppErrorCode
  readonly operation: FamilyOperation
  readonly retryable: boolean

  constructor(operation: FamilyOperation, code: AppErrorCode, cause?: unknown) {
    super(`family:${operation}:${code}`)
    this.name = 'FamilyError'
    this.operation = operation
    this.code = code
    this.retryable = isRetryableErrorCode(code)
    this.cause = cause
  }
}

function message(error: unknown): string {
  return error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : ''
}

function refine(operation: FamilyOperation, code: AppErrorCode, error: unknown): AppErrorCode {
  const text = message(error)

  // Redeeming a code that is spent or expired is a conflict, not a missing
  // row: the user needs a new code rather than another attempt.
  if (operation === 'family.redeemInvite' && (code === 'not-found' || /expired|already used|consumed/i.test(text))) {
    return 'conflict'
  }
  // An account already linked to another member.
  if (operation === 'family.updateProfile' && /already linked|duplicate/i.test(text)) return 'conflict'
  // The RPCs guard role transitions (last admin leaving, promoting a child).
  if (/last admin|cannot remove|invalid role|not permitted/i.test(text)) return 'permission-denied'
  // Storage rejects an object that already exists.
  if ((operation === 'family.uploadAvatar' || operation === 'family.uploadHeroImage') && /already exists|duplicate/i.test(text)) {
    return 'conflict'
  }
  return code
}

export function toFamilyError(operation: FamilyOperation, error: unknown): FamilyError {
  if (error instanceof FamilyError) return error
  const browserOnline = typeof navigator === 'undefined' ? undefined : navigator.onLine !== false
  return new FamilyError(operation, refine(operation, classifyAppError(error, { browserOnline }), error), error)
}
