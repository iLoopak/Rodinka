import { t } from '../strings'
import { ChildAccountError } from './childAccountAdmin'

// Mirrors lib/authErrors: every failure reaching a parent is localized copy
// they can act on. Unrecognized causes collapse into one generic message
// rather than leaking server text.
export function childAccountErrorMessage(error: unknown): string {
  const errors = t.family.childAccount.errors
  if (!(error instanceof ChildAccountError)) return errors.unknown
  switch (error.code) {
    case 'login_name_taken': return errors.loginNameTaken
    case 'invalid_login_name': return errors.invalidLoginName
    case 'invalid_password': return errors.invalidPassword
    case 'not_authorized': return errors.notAuthorized
    case 'child_not_found': return errors.childNotFound
    case 'account_not_active': return errors.accountNotActive
    case 'offline': return errors.offline
    default: return errors.unknown
  }
}
