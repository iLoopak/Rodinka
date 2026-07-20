export type SupabaseRequestKind = 'read' | 'signed-url' | 'other'

interface DiagnosticSnapshot {
  elapsedMs: number
  supabaseReads: number
  signedUrlRequests: number
  mealIngredientReads: number
  pushDeviceListReads: number
  childAccountReads: number
  lazyLoadedModules: number
}

const startedAt = typeof performance === 'undefined' ? 0 : performance.now()
const counters = {
  supabaseReads: 0,
  signedUrlRequests: 0,
  mealIngredientReads: 0,
  pushDeviceListReads: 0,
  childAccountReads: 0,
}
const lazyModules = new Set<string>()

const devEnabled = () => typeof import.meta !== 'undefined' && import.meta.env?.DEV

export function classifySupabaseRequest(url: string, method: string): { kind: SupabaseRequestKind; resource: string | null } {
  const pathname = new URL(url, 'http://localhost').pathname
  const normalizedMethod = method.toUpperCase()
  const restMatch = /\/rest\/v1\/([^/]+)/.exec(pathname)
  if (restMatch && (normalizedMethod === 'GET' || normalizedMethod === 'HEAD')) {
    return { kind: 'read', resource: decodeURIComponent(restMatch[1]) }
  }
  if (pathname.includes('/storage/v1/object/sign/')) return { kind: 'signed-url', resource: 'storage-object' }
  return { kind: 'other', resource: null }
}

export function recordSupabaseStartupRequest(input: RequestInfo | URL, init?: RequestInit) {
  if (!devEnabled()) return
  const request = typeof Request !== 'undefined' && input instanceof Request ? input : null
  const url = input instanceof URL ? input.href : request?.url ?? String(input)
  const method = init?.method ?? request?.method ?? 'GET'
  const event = classifySupabaseRequest(url, method)
  if (event.kind === 'read') {
    counters.supabaseReads += 1
    if (event.resource === 'meal_ingredients') counters.mealIngredientReads += 1
    if (event.resource === 'push_subscriptions') counters.pushDeviceListReads += 1
    if (event.resource === 'child_accounts') counters.childAccountReads += 1
  } else if (event.kind === 'signed-url') {
    counters.signedUrlRequests += 1
  } else {
    return
  }
  logSnapshot()
}

export function recordLazyStartupModule(moduleName: string) {
  if (!devEnabled() || lazyModules.has(moduleName)) return
  lazyModules.add(moduleName)
  logSnapshot()
}

function logSnapshot() {
  const snapshot: DiagnosticSnapshot = {
    elapsedMs: Math.round((typeof performance === 'undefined' ? startedAt : performance.now()) - startedAt),
    ...counters,
    lazyLoadedModules: lazyModules.size,
  }
  console.info('[Rodinka startup]', snapshot)
}
