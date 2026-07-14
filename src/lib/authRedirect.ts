// Central place for the URL Supabase should send the user back to after an
// OAuth redirect. Deriving it from the current origin means this works
// unmodified on localhost, Vercel previews, and production — each origin
// just needs to be added to Supabase's allowed redirect URLs (see the
// manual setup checklist in the PR description / README).
interface RedirectLocation {
  origin: string
  pathname: string
  search: string
  hash: string
}

export function getAuthRedirectUrl(location: RedirectLocation = window.location): string {
  return `${location.origin}${location.pathname}${location.search}${location.hash}`
}
