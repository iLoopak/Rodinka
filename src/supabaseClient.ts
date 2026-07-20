import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars. Make sure .env has VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  )
}

const diagnosticFetch: typeof fetch = (input, init) => {
  if (import.meta.env.DEV) {
    void import('./startup/startupDiagnostics').then(({ recordSupabaseStartupRequest }) => {
      recordSupabaseStartupRequest(input, init)
    })
  }
  return fetch(input, init)
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: import.meta.env.DEV ? { fetch: diagnosticFetch } : undefined,
})
