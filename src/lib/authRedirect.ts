// Central place for the URL Supabase should send the user back to after an
// OAuth redirect. Deriving it from the current origin means this works
// unmodified on localhost, Vercel previews, and production — each origin
// just needs to be added to Supabase's allowed redirect URLs (see the
// manual setup checklist in the PR description / README).
export function getAuthRedirectUrl(): string {
  return `${window.location.origin}/`
}
