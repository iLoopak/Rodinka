import { type AppErrorCode } from '../../../errors/errorCodes'
import { createDomainErrorConverter, DomainError, extractErrorMessage } from '../../../errors/domainError'

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

export class FamilyError extends DomainError<FamilyOperation> {
  constructor(operation: FamilyOperation, code: AppErrorCode, cause?: unknown) {
    super('FamilyError', 'family', operation, code, cause)
  }
}

function refine(operation: FamilyOperation, code: AppErrorCode, error: unknown): AppErrorCode {
  const text = extractErrorMessage(error)

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

export const toFamilyError = createDomainErrorConverter(FamilyError, refine)
