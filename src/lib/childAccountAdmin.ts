import { supabase } from '../supabaseClient'

export type ChildAccountErrorCode =
  | 'login_name_taken'
  | 'invalid_login_name'
  | 'invalid_password'
  | 'not_authorized'
  | 'child_not_found'
  | 'account_not_active'
  | 'offline'
  | 'unknown'

export class ChildAccountError extends Error {
  readonly code: ChildAccountErrorCode
  constructor(code: ChildAccountErrorCode) {
    super(`child_account_${code}`)
    this.name = 'ChildAccountError'
    this.code = code
  }
}

// The Edge Function's wire vocabulary, narrowed to the cases the UI can act
// on. Anything unmapped becomes 'unknown' rather than surfacing raw server
// text, which may name internal RPCs or Auth internals.
function mapServerError(serverCode: string): ChildAccountErrorCode {
  switch (serverCode) {
    // Both a reservation clash and a duplicate Auth identity arrive as
    // account_unavailable. The actionable reading for a parent is the same:
    // this login name can't be used, pick another.
    case 'account_unavailable':
    case 'account_link_failed':
      return 'login_name_taken'
    case 'invalid_login_name':
      return 'invalid_login_name'
    case 'invalid_password':
      return 'invalid_password'
    case 'not_authorized':
    case 'authentication_required':
    case 'invalid_session':
      return 'not_authorized'
    case 'child_not_found':
      return 'child_not_found'
    case 'account_not_active':
    case 'revocation_failed':
      return 'account_not_active'
    default:
      return 'unknown'
  }
}

interface EdgeResponse {
  ok?: boolean
  error?: string
  status?: string
  memberId?: string
  loginName?: string
  cleanupPending?: boolean
}

// supabase-js surfaces any non-2xx as a FunctionsHttpError whose body has not
// been read yet; the error code we need is inside it. Failing to parse leaves
// us with 'unknown', never a raw dump.
async function readErrorCode(error: unknown): Promise<ChildAccountErrorCode> {
  const context = (error as { context?: unknown })?.context
  if (!(context instanceof Response)) return 'unknown'
  try {
    const body = await context.json() as EdgeResponse
    return mapServerError(String(body?.error ?? ''))
  } catch {
    return 'unknown'
  }
}

async function callEdge(body: Record<string, unknown>): Promise<EdgeResponse> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ChildAccountError('offline')
  }
  const { data, error } = await supabase.functions.invoke<EdgeResponse>('manage-child-account', { body })
  if (error) throw new ChildAccountError(await readErrorCode(error))
  if (!data?.ok) throw new ChildAccountError(mapServerError(String(data?.error ?? '')))
  return data
}

export interface ProvisionResult {
  loginName: string
}

export async function provisionChildAccount(memberId: string, loginName: string, password: string): Promise<ProvisionResult> {
  const data = await callEdge({ action: 'provision', memberId, loginName, password })
  return { loginName: String(data.loginName ?? loginName) }
}

export async function resetChildPassword(memberId: string, password: string): Promise<void> {
  await callEdge({ action: 'reset-password', memberId, password })
}

export interface RevokeResult {
  // The child's family access is already gone at this point; a pending cleanup
  // only means the orphaned Auth user outlived the request.
  cleanupPending: boolean
}

export async function revokeChildAccount(memberId: string): Promise<RevokeResult> {
  const data = await callEdge({ action: 'revoke', memberId })
  return { cleanupPending: Boolean(data.cleanupPending) }
}
