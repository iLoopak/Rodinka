import { t } from '../strings'

interface AuthErrorLike {
  message?: string
  code?: string
}

// Supabase's raw auth errors are English, sometimes technical (constraint
// names, provider internals), and not meant for end users. Map the common,
// expected cases to localized copy; anything unrecognized falls back to a
// single generic message rather than leaking raw Supabase text.
export function translateAuthError(error: AuthErrorLike | null | undefined): string {
  const code = error?.code?.toLowerCase() ?? ''
  const message = error?.message?.toLowerCase() ?? ''

  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return t.login.errors.invalidCredentials
  }

  if (
    code === 'user_already_exists' ||
    message.includes('already registered') ||
    message.includes('already exists')
  ) {
    return t.login.errors.userAlreadyExists
  }

  if (code === 'weak_password' || (message.includes('password') && message.includes('least'))) {
    return t.login.errors.passwordTooShort
  }

  if (
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    message.includes('rate limit')
  ) {
    return t.login.errors.tooManyRequests
  }

  if (code === 'validation_failed' && message.includes('email')) {
    return t.login.errors.invalidEmail
  }

  console.error('Supabase auth error:', error?.message)
  return t.errors.generic
}
