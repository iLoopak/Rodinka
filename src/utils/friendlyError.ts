import { t } from '../strings'

// Supabase error messages aren't meant for end users (raw constraint names,
// English text). Log the real one for debugging, surface a generic string.
//
// Takes `unknown` because repositories now throw normalized domain errors
// rather than PostgrestError shapes, and a caller should not have to narrow
// the type just to produce a user-facing message.
export function friendly(error: unknown): Error {
  const message = error instanceof Error
    ? error.message
    : error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error ?? 'unknown error')
  console.error(message)
  return new Error(t.errors.generic)
}
