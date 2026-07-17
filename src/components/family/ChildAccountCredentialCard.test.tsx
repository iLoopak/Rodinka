// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../strings'
import { ChildAccountCredentialCard } from './ChildAccountCredentialCard'

const copy = t.family.childAccount
const writeText = vi.fn()

function renderCard() {
  return render(<ChildAccountCredentialCard
    childName="Alex"
    loginName="alex"
    passphrase="ryba-strom-kolo-42"
    onDone={vi.fn()}
  />)
}

describe('ChildAccountCredentialCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    writeText.mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
  })
  afterEach(cleanup)

  it('warns that the passphrase cannot be shown again', () => {
    renderCard()
    expect(screen.getByRole('alert').textContent).toBe(copy.credentialWarning)
    expect(screen.getByText(copy.childInstruction)).toBeTruthy()
  })

  it('copies each value separately, only on request', () => {
    renderCard()
    // Nothing reaches the clipboard until the parent asks for it.
    expect(writeText).not.toHaveBeenCalled()

    fireEvent.click(screen.getByLabelText(copy.copyLoginNameFor('Alex')))
    expect(writeText).toHaveBeenCalledWith('alex')

    fireEvent.click(screen.getByLabelText(copy.copyPassphraseFor('Alex')))
    expect(writeText).toHaveBeenCalledWith('ryba-strom-kolo-42')
    expect(writeText).toHaveBeenCalledTimes(2)
  })

  it('confirms a copy without claiming success for the other value', async () => {
    renderCard()
    fireEvent.click(screen.getByLabelText(copy.copyPassphraseFor('Alex')))
    await screen.findByRole('button', { name: copy.copyPassphraseFor('Alex') })
    expect(screen.getByLabelText(copy.copyPassphraseFor('Alex')).textContent).toBe(copy.copied)
    expect(screen.getByLabelText(copy.copyLoginNameFor('Alex')).textContent).toBe(copy.copyLoginName)
  })

  it('stays usable when the clipboard is unavailable', () => {
    writeText.mockRejectedValue(new Error('denied'))
    renderCard()
    fireEvent.click(screen.getByLabelText(copy.copyPassphraseFor('Alex')))
    // The value is still on screen to type manually; a denied clipboard is
    // not an error worth interrupting the parent with.
    expect(screen.getByText('ryba-strom-kolo-42')).toBeTruthy()
  })
})
