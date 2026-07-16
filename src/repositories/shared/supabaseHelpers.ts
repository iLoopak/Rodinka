import { supabase } from '../../supabaseClient'
import { throwRepositoryError } from './repositoryError'

export type SupabaseClientLike = typeof supabase

export function requireNoError<T extends { error: unknown }>(result: T, fallback: string): T {
  if (result.error) throwRepositoryError(result.error, fallback)
  return result
}
