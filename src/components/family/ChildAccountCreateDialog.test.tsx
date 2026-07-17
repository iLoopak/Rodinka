// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../strings'
import type { FamilyMember } from '../../hooks/useFamilyMembers'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('../../supabaseClient', () => ({ supabase: { functions: { invoke } } }))

import { ChildAccountCreateDialog } from './ChildAccountCreateDialog'

const child: FamilyMember = {
  id: 'child-1', family_id: 'family-1', display_name: 'Anežka', role: 'child', user_id: null,
  birth_date: null, color_key: null, avatar_path: null, avatar_url: null,
  grammatical_gender: null, vocative_name: null, status: 'active',
}

const copy = t.family.childAccount

function loginInput() {
  return screen.getByLabelText(copy.loginNameLabel) as HTMLInputElement
}
function passphraseInput() {
  return screen.getByLabelText(copy.passphraseLabel) as HTMLInputElement
}

describe('ChildAccountCreateDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, value: true })
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  })
  afterEach(cleanup)

  it('suggests a typable login name and a generated passphrase', () => {
    render(<ChildAccountCreateDialog child={child} onCreated={vi.fn()} onClose={vi.fn()} />)
    expect(loginInput().value).toBe('anezka')
    expect(passphraseInput().value).toMatch(/^[a-z]+-[a-z]+-[a-z]+-\d{2}$/)
  })

  it('lets the parent regenerate the passphrase', () => {
    render(<ChildAccountCreateDialog child={child} onCreated={vi.fn()} onClose={vi.fn()} />)
    const first = passphraseInput().value
    fireEvent.click(screen.getByRole('button', { name: copy.generateAnother }))
    expect(passphraseInput().value).not.toBe(first)
  })

  it('blocks submission of a client-invalid login name', () => {
    render(<ChildAccountCreateDialog child={child} onCreated={vi.fn()} onClose={vi.fn()} />)
    fireEvent.change(loginInput(), { target: { value: 'a' } })
    expect((screen.getByRole('button', { name: copy.createSubmit }) as HTMLButtonElement).disabled).toBe(true)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('sends the normalized login name and shows the credentials once', async () => {
    invoke.mockResolvedValue({ data: { ok: true, status: 'active', memberId: 'child-1', loginName: 'anezka' }, error: null })
    const onCreated = vi.fn()
    render(<ChildAccountCreateDialog child={child} onCreated={onCreated} onClose={vi.fn()} />)
    const passphrase = passphraseInput().value

    fireEvent.click(screen.getByRole('button', { name: copy.createSubmit }))
    await screen.findByText(copy.credentialWarning)

    expect(invoke).toHaveBeenCalledWith('manage-child-account', {
      body: { action: 'provision', memberId: 'child-1', loginName: 'anezka', password: passphrase },
    })
    expect(onCreated).toHaveBeenCalled()
    expect(screen.getByText('anezka')).toBeTruthy()
    expect(screen.getByText(passphrase)).toBeTruthy()
  })

  it('does not provision twice when submitted rapidly', async () => {
    invoke.mockResolvedValue({ data: { ok: true, loginName: 'anezka' }, error: null })
    render(<ChildAccountCreateDialog child={child} onCreated={vi.fn()} onClose={vi.fn()} />)
    const submit = screen.getByRole('button', { name: copy.createSubmit })
    fireEvent.click(submit)
    fireEvent.click(submit)
    await screen.findByText(copy.credentialWarning)
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('clears the passphrase from the dialog when the success state closes', async () => {
    invoke.mockResolvedValue({ data: { ok: true, loginName: 'anezka' }, error: null })
    const onClose = vi.fn()
    render(<ChildAccountCreateDialog child={child} onCreated={vi.fn()} onClose={onClose} />)
    const passphrase = passphraseInput().value
    fireEvent.click(screen.getByRole('button', { name: copy.createSubmit }))
    await screen.findByText(copy.credentialWarning)

    fireEvent.click(screen.getByRole('button', { name: copy.credentialDone }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(document.body.textContent).not.toContain(passphrase)
  })

  it('surfaces a taken login name as actionable localized copy', async () => {
    const error = new Error('non-2xx')
    ;(error as unknown as { context: Response }).context = new Response(JSON.stringify({ ok: false, error: 'account_unavailable' }), { status: 409 })
    invoke.mockResolvedValue({ data: null, error })
    render(<ChildAccountCreateDialog child={child} onCreated={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: copy.createSubmit }))
    expect((await screen.findByRole('alert')).textContent).toBe(copy.errors.loginNameTaken)
    // The dialog stays open so the parent can pick another name.
    expect(loginInput()).toBeTruthy()
  })

  it('keeps the passphrase out of the DOM after a failed attempt is closed', async () => {
    const error = new Error('non-2xx')
    ;(error as unknown as { context: Response }).context = new Response(JSON.stringify({ ok: false, error: 'account_unavailable' }), { status: 409 })
    invoke.mockResolvedValue({ data: null, error })
    render(<ChildAccountCreateDialog child={child} onCreated={vi.fn()} onClose={vi.fn()} />)
    const passphrase = passphraseInput().value
    fireEvent.click(screen.getByRole('button', { name: copy.createSubmit }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: t.common.cancel }))
    expect(document.body.textContent).not.toContain(passphrase)
  })
})
