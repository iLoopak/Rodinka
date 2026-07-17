import { createClient } from 'npm:@supabase/supabase-js@2.110.2'
import {
  childLoginNameToInternalEmail,
  isValidChildLoginName,
  normalizeChildLoginName,
} from '../../../src/lib/childAccountIdentity.ts'

type AccountAction = 'provision' | 'reset-password' | 'revoke'

interface ChildAccountRequest {
  action?: AccountAction
  memberId?: string
  loginName?: string
  password?: string
}

interface MemberRow {
  id: string
  family_id: string
  user_id: string | null
  role: 'admin' | 'parent' | 'child'
  status: 'active' | 'inactive' | 'removed'
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' },
  })
}

function validPassword(password: string | undefined): password is string {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (request.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json(500, { ok: false, error: 'server_not_configured' })

  const authorization = request.headers.get('authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) return json(401, { ok: false, error: 'authentication_required' })
  const token = authorization.slice(7)
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: callerData, error: callerError } = await callerClient.auth.getUser(token)
  if (callerError || !callerData.user) return json(401, { ok: false, error: 'invalid_session' })

  let input: ChildAccountRequest
  try { input = await request.json() as ChildAccountRequest }
  catch { return json(400, { ok: false, error: 'invalid_json' }) }
  if (!input || typeof input !== 'object' || Object.keys(input).some((key) => !['action', 'memberId', 'loginName', 'password'].includes(key))) {
    return json(400, { ok: false, error: 'invalid_request' })
  }
  if (!input.action || !['provision', 'reset-password', 'revoke'].includes(input.action)) {
    return json(400, { ok: false, error: 'invalid_action' })
  }
  if (!input.memberId || !UUID.test(input.memberId)) return json(400, { ok: false, error: 'invalid_member' })

  const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: actorData } = await service
    .from('members')
    .select('id,family_id,user_id,role,status')
    .eq('user_id', callerData.user.id)
    .eq('status', 'active')
    .maybeSingle()
  const actor = actorData as MemberRow | null
  if (!actor || !['admin', 'parent'].includes(actor.role)) return json(403, { ok: false, error: 'not_authorized' })

  const { data: targetData } = await service
    .from('members')
    .select('id,family_id,user_id,role,status')
    .eq('id', input.memberId)
    .eq('family_id', actor.family_id)
    .eq('role', 'child')
    .eq('status', 'active')
    .maybeSingle()
  const target = targetData as MemberRow | null
  if (!target) return json(404, { ok: false, error: 'child_not_found' })

  if (input.action === 'provision') {
    const loginName = normalizeChildLoginName(input.loginName ?? '')
    if (!isValidChildLoginName(loginName)) return json(400, { ok: false, error: 'invalid_login_name' })
    if (!validPassword(input.password)) return json(400, { ok: false, error: 'invalid_password' })
    const internalIdentifier = childLoginNameToInternalEmail(loginName)
    const { error: reservationError } = await service.rpc('begin_child_account_provision', {
      p_member_id: target.id,
      p_manager_member_id: actor.id,
      p_login_name: loginName,
      p_internal_identifier: internalIdentifier,
    })
    if (reservationError) return json(409, { ok: false, error: 'account_unavailable' })

    const { data: created, error: createError } = await service.auth.admin.createUser({
      email: internalIdentifier,
      password: input.password,
      email_confirm: true,
      app_metadata: { account_type: 'managed_child', member_id: target.id, login_name: loginName },
    })
    if (createError || !created.user) {
      await service.rpc('abort_child_account_provision', { p_member_id: target.id, p_manager_member_id: actor.id })
      return json(409, { ok: false, error: 'account_unavailable' })
    }

    const { error: linkError } = await service.rpc('finalize_child_account_provision', {
      p_member_id: target.id,
      p_manager_member_id: actor.id,
      p_auth_user_id: created.user.id,
    })
    if (linkError) {
      await service.auth.admin.deleteUser(created.user.id)
      await service.rpc('abort_child_account_provision', { p_member_id: target.id, p_manager_member_id: actor.id })
      return json(409, { ok: false, error: 'account_link_failed' })
    }
    return json(201, { ok: true, status: 'active', memberId: target.id, loginName })
  }

  if (input.action === 'reset-password') {
    if (!validPassword(input.password)) return json(400, { ok: false, error: 'invalid_password' })
    const { data: account } = await service
      .from('child_accounts')
      .select('auth_user_id,status')
      .eq('member_id', target.id)
      .eq('status', 'active')
      .maybeSingle()
    const authUserId = account?.auth_user_id as string | undefined
    if (!authUserId || authUserId !== target.user_id) return json(409, { ok: false, error: 'account_not_active' })
    const { error } = await service.auth.admin.updateUserById(authUserId, { password: input.password })
    if (error) return json(400, { ok: false, error: 'password_reset_failed' })
    const { error: auditError } = await service.rpc('record_child_account_password_reset', {
      p_member_id: target.id,
      p_manager_member_id: actor.id,
    })
    if (auditError) return json(500, { ok: false, error: 'account_audit_failed' })
    return json(200, { ok: true, status: 'active', memberId: target.id })
  }

  const { data: detached, error: detachError } = await service.rpc('detach_child_account_access', {
    p_member_id: target.id,
    p_manager_member_id: actor.id,
  })
  if (detachError) return json(409, { ok: false, error: 'revocation_failed' })
  const authUserId = typeof detached === 'object' && detached && 'auth_user_id' in detached
    ? String(detached.auth_user_id ?? '')
    : ''
  if (!authUserId) return json(200, { ok: true, status: 'revoked', memberId: target.id, cleanupPending: false })
  const { error: deleteError } = await service.auth.admin.deleteUser(authUserId)
  return json(200, { ok: true, status: 'revoked', memberId: target.id, cleanupPending: Boolean(deleteError) })
})
