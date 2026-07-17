// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('../supabaseClient', () => ({ supabase: { functions: { invoke } } }))

import { ChildAccountError, provisionChildAccount, resetChildPassword, revokeChildAccount } from './childAccountAdmin'
import { childAccountErrorMessage } from './childAccountErrors'
import { t } from '../strings'

function httpError(status: number, body: unknown) {
  const error = new Error('Edge Function returned a non-2xx status code')
  ;(error as unknown as { context: Response }).context = new Response(JSON.stringify(body), { status })
  return { data: null, error }
}

describe('childAccountAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, value: true })
  })

  it('sends only the action and the fields the server expects', async () => {
    invoke.mockResolvedValue({ data: { ok: true, status: 'active', memberId: 'child-1', loginName: 'alex' }, error: null })
    await provisionChildAccount('child-1', 'alex', 'ryba-strom-kolo-42')
    expect(invoke).toHaveBeenCalledWith('manage-child-account', {
      body: { action: 'provision', memberId: 'child-1', loginName: 'alex', password: 'ryba-strom-kolo-42' },
    })
  })

  it('never sends a family id, role, or auth user id from client state', async () => {
    invoke.mockResolvedValue({ data: { ok: true, loginName: 'alex' }, error: null })
    await provisionChildAccount('child-1', 'alex', 'ryba-strom-kolo-42')
    const body = invoke.mock.calls[0][1].body as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['action', 'loginName', 'memberId', 'password'])
  })

  it('maps a taken login name from the server 409 body', async () => {
    invoke.mockResolvedValue(httpError(409, { ok: false, error: 'account_unavailable' }))
    await expect(provisionChildAccount('child-1', 'alex', 'ryba-strom-kolo-42')).rejects.toMatchObject({ code: 'login_name_taken' })
  })

  it('maps authorization failures without leaking server text', async () => {
    invoke.mockResolvedValue(httpError(403, { ok: false, error: 'not_authorized' }))
    const error = await provisionChildAccount('child-1', 'alex', 'ryba-strom-kolo-42').catch((caught) => caught)
    expect(error).toBeInstanceOf(ChildAccountError)
    expect(childAccountErrorMessage(error)).toBe(t.family.childAccount.errors.notAuthorized)
  })

  it('collapses unrecognized server errors into one generic message', async () => {
    invoke.mockResolvedValue(httpError(500, { ok: false, error: 'pg_function_detach_child_account_access_failed' }))
    const error = await resetChildPassword('child-1', 'ryba-strom-kolo-42').catch((caught) => caught)
    expect((error as ChildAccountError).code).toBe('unknown')
    expect(childAccountErrorMessage(error)).toBe(t.family.childAccount.errors.unknown)
  })

  it('survives an error body that is not JSON', async () => {
    const error = new Error('boom')
    ;(error as unknown as { context: Response }).context = new Response('<html>gateway timeout</html>', { status: 504 })
    invoke.mockResolvedValue({ data: null, error })
    await expect(revokeChildAccount('child-1')).rejects.toMatchObject({ code: 'unknown' })
  })

  it('fails fast while offline instead of firing a doomed request', async () => {
    Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, value: false })
    await expect(revokeChildAccount('child-1')).rejects.toMatchObject({ code: 'offline' })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('reports a pending Auth cleanup as a successful revocation', async () => {
    invoke.mockResolvedValue({ data: { ok: true, status: 'revoked', memberId: 'child-1', cleanupPending: true }, error: null })
    await expect(revokeChildAccount('child-1')).resolves.toEqual({ cleanupPending: true })
  })

  it('treats an ok:false 200 body as a failure', async () => {
    invoke.mockResolvedValue({ data: { ok: false, error: 'account_not_active' }, error: null })
    await expect(resetChildPassword('child-1', 'ryba-strom-kolo-42')).rejects.toMatchObject({ code: 'account_not_active' })
  })
})
