// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../strings'
import type { FamilyMember } from '../../hooks/useFamilyMembers'
import type { ChildAccount } from '../../hooks/useChildAccounts'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('../../supabaseClient', () => ({ supabase: { functions: { invoke } } }))

import { ChildAccountSection } from './ChildAccountSection'

const child: FamilyMember = {
  id: 'child-1', family_id: 'family-1', display_name: 'Alex', role: 'child', user_id: null,
  birth_date: null, color_key: null, avatar_path: null, avatar_url: null,
  grammatical_gender: null, vocative_name: null, status: 'active',
}
const linkedChild: FamilyMember = { ...child, user_id: 'auth-1' }
const activeAccount: ChildAccount = {
  member_id: 'child-1', login_name: 'alex', status: 'active',
  activated_at: '2026-07-01T10:00:00Z', password_reset_at: null, revoked_at: null,
}

const copy = t.family.childAccount

describe('ChildAccountSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, value: true })
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  })
  afterEach(cleanup)

  it('offers creation and nothing else when the child has no account', () => {
    render(<ChildAccountSection child={child} account={null} onChanged={vi.fn()} />)
    expect(screen.getByText(copy.statusNone)).toBeTruthy()
    expect(screen.getByText(copy.noneExplain)).toBeTruthy()
    expect(screen.getByRole('button', { name: copy.createAction })).toBeTruthy()
    expect(screen.queryByRole('button', { name: copy.resetAction })).toBeNull()
    expect(screen.queryByRole('button', { name: copy.revokeActionFor('Alex') })).toBeNull()
  })

  it('shows the login name with reset and revoke for an active account', () => {
    render(<ChildAccountSection child={linkedChild} account={activeAccount} onChanged={vi.fn()} />)
    expect(screen.getByText(copy.statusActive)).toBeTruthy()
    expect(screen.getByText('alex')).toBeTruthy()
    expect(screen.getByRole('button', { name: copy.resetAction })).toBeTruthy()
    expect(screen.getByRole('button', { name: copy.revokeActionFor('Alex') })).toBeTruthy()
    expect(screen.queryByRole('button', { name: copy.createAction })).toBeNull()
  })

  it('explains a revoked account and offers explicit reactivation', () => {
    render(<ChildAccountSection
      child={child}
      account={{ ...activeAccount, status: 'revoked', revoked_at: '2026-07-10T10:00:00Z' }}
      onChanged={vi.fn()}
    />)
    expect(screen.getByText(copy.statusRevoked)).toBeTruthy()
    expect(screen.getByText(copy.revokedExplain)).toBeTruthy()
    expect(screen.getByRole('button', { name: copy.reactivateAction })).toBeTruthy()
    expect(screen.queryByRole('button', { name: copy.resetAction })).toBeNull()
  })

  it('never renders internal auth identifiers', () => {
    const { container } = render(<ChildAccountSection child={linkedChild} account={activeAccount} onChanged={vi.fn()} />)
    expect(container.textContent).not.toContain('children.rodinka.invalid')
    expect(container.textContent).not.toContain('auth-1')
  })

  it('requires confirmation before resetting and shows the new passphrase once', async () => {
    invoke.mockResolvedValue({ data: { ok: true, status: 'active', memberId: 'child-1' }, error: null })
    const onChanged = vi.fn()
    render(<ChildAccountSection child={linkedChild} account={activeAccount} onChanged={onChanged} />)

    fireEvent.click(screen.getByRole('button', { name: copy.resetAction }))
    expect(invoke).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: copy.resetConfirm }))
    await screen.findByText(copy.credentialWarning)
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(onChanged).toHaveBeenCalled()

    const passphrase = screen.getByLabelText(copy.copyPassphraseFor('Alex')).closest('dd')?.querySelector('code')?.textContent
    expect(passphrase).toMatch(/^[a-z]+-[a-z]+-[a-z]+-\d{2}$/)

    // Closing the one-time card must make the secret unrecoverable.
    fireEvent.click(screen.getByRole('button', { name: copy.credentialDone }))
    await waitFor(() => expect(screen.queryByText(copy.credentialWarning)).toBeNull())
    expect(document.body.textContent).not.toContain(passphrase)
  })

  it('never sends the reset password to the server twice on a double click', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null })
    render(<ChildAccountSection child={linkedChild} account={activeAccount} onChanged={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: copy.resetAction }))
    const confirm = screen.getByRole('button', { name: copy.resetConfirm })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await screen.findByText(copy.credentialWarning)
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('names the child in the revoke confirmation and lists the consequences', () => {
    render(<ChildAccountSection child={linkedChild} account={activeAccount} onChanged={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: copy.revokeActionFor('Alex') }))
    expect(screen.getByText(copy.revokeTitle('Alex'))).toBeTruthy()
    expect(screen.getByText(copy.revokeConsequence1)).toBeTruthy()
    expect(screen.getByText(copy.revokeConsequence3)).toBeTruthy()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('reports a pending Auth cleanup as blocked access rather than a failure', async () => {
    invoke.mockResolvedValue({ data: { ok: true, status: 'revoked', cleanupPending: true }, error: null })
    render(<ChildAccountSection child={linkedChild} account={activeAccount} onChanged={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: copy.revokeActionFor('Alex') }))
    fireEvent.click(screen.getByRole('button', { name: copy.revokeConfirm }))
    expect((await screen.findByRole('status')).textContent).toBe(copy.revokeCleanupPending)
  })

  it('shows a localized safe message when revocation fails', async () => {
    const error = new Error('non-2xx')
    ;(error as unknown as { context: Response }).context = new Response(JSON.stringify({ ok: false, error: 'not_authorized' }), { status: 403 })
    invoke.mockResolvedValue({ data: null, error })
    render(<ChildAccountSection child={linkedChild} account={activeAccount} onChanged={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: copy.revokeActionFor('Alex') }))
    fireEvent.click(screen.getByRole('button', { name: copy.revokeConfirm }))

    // Reported once, inside the dialog that stays open for a retry.
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.map((node) => node.textContent)).toEqual([copy.errors.notAuthorized])
    expect(screen.getByRole('button', { name: copy.revokeConfirm })).toBeTruthy()
  })
})
