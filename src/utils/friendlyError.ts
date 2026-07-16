import { t } from '../strings'

// Supabase error messages aren't meant for end users (raw constraint names,
// English text). Log the real one for debugging, surface a generic string.
export function friendly(error: { message: string }): Error {
  console.error(error.message)
  return new Error(t.errors.generic)
}
