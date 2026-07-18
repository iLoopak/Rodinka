import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8')
const composer = readFileSync(new URL('./components/messages/Composer.tsx', import.meta.url), 'utf8')
const screen = readFileSync(new URL('./components/messages/MessagesScreen.tsx', import.meta.url), 'utf8')
const picker = readFileSync(new URL('./components/messages/ShareExistingEntityDialog.tsx', import.meta.url), 'utf8')

function ruleBody(selector: string) {
  const start = css.indexOf(`\n${selector} {`)
  if (start === -1) throw new Error(`CSS rule not found: ${selector}`)
  return css.slice(start, css.indexOf('}', start))
}

describe('message bubble sizing', () => {
  const bubble = ruleBody('.messages-bubble')

  it('does not use overflow-wrap:anywhere, which collapses min-content to one character', () => {
    // This is the actual cause of the "A"/"OK" one-character-wide tower:
    // `anywhere` shrinks the intrinsic min-content contribution, and the
    // thread's column flex sizes the bubble from it. `break-word` wraps
    // identically without touching intrinsic size.
    expect(bubble).toContain('overflow-wrap: break-word')
    expect(bubble).not.toContain('overflow-wrap: anywhere')
  })

  it('drops the legacy word-break override that paired with it', () => {
    expect(bubble).not.toContain('word-break: break-word')
  })

  it('keeps a minimum width and a bounded maximum width', () => {
    expect(bubble).toContain('min-width:')
    expect(bubble).toContain('max-width: min(78%, 520px)')
  })

  it('never lets the timestamp break across lines', () => {
    // The bubble sets `white-space: pre-wrap`, so the space in "09:30 PM"
    // is a real break opportunity unless this is pinned.
    expect(ruleBody('.messages-bubble-time')).toContain('white-space: nowrap')
    expect(ruleBody('.messages-bubble-meta')).toContain('white-space: nowrap')
  })

  it('stops the per-message wrapper from collapsing to fit-content', () => {
    // The thread cluster is a column flex with a non-stretch align-items,
    // so an unsized wrapper shrinks around the bubble and squeezes it.
    expect(ruleBody('.messages-thread-item')).toContain('width: 100%')
    expect(screen).toContain('messages-thread-item')
  })

  it('keeps a shared entity card from overflowing its bubble', () => {
    expect(ruleBody('.messages-entity-card')).toContain('min-width: 0')
  })
})

describe('composer "+" menu shares existing records', () => {
  it('does not open a creation form from the + menu', () => {
    expect(composer).toContain('onShareEntity')
    expect(composer).not.toContain('onCreateEntity')
    expect(composer).not.toContain('CreateFromMessageKind')
  })

  it('offers all three entity kinds through the picker', () => {
    expect(composer).toContain("onShareEntity('task')")
    expect(composer).toContain("onShareEntity('shopping_item')")
    expect(composer).toContain("onShareEntity('event')")
  })

  it('leaves the photo upload path untouched', () => {
    expect(composer).toContain('openPhotoPicker')
    expect(composer).toContain('uploadAttachment')
  })

  it('still allows creating a record from an existing message via the context menu', () => {
    // Regression guard: the "+" menu changed, but "create a task from THIS
    // message" is a separate feature and must survive.
    expect(screen).toContain('CreateFromMessageDialog')
    expect(screen).toMatch(/setCreateFrom\(\{ kind: 'task', text: target\.body/)
  })
})

describe('entity picker shares by reference, never by creation', () => {
  it('goes through the existing shareEntity RPC wrapper', () => {
    expect(picker).toContain('shareEntity(conversationId, {')
    expect(picker).toContain('entityType: kind')
    expect(picker).toContain('entityId: chosen.id')
  })

  it('stores only a title snapshot as the deleted-record fallback', () => {
    expect(picker).toContain('fallbackLabel: chosen.title')
  })

  it('does not call any creation mutation', () => {
    expect(picker).not.toMatch(/addChore|addActivity|addShoppingItem|insert\(/)
  })

  it('reads options from the modules own contexts, not a fresh query', () => {
    // Inheriting their state is what keeps the picker from showing a record
    // the user is not already allowed to see.
    expect(picker).toContain('useChoresData')
    expect(picker).toContain('useShopping')
    expect(picker).toContain('useActivitiesData')
    expect(picker).not.toContain('supabase')
  })

  it('covers loading, error, empty and confirm states', () => {
    expect(picker).toContain('entityPicker.loading')
    expect(picker).toContain('entityPicker.loadFailed')
    expect(picker).toContain('copy.empty')
    expect(picker).toContain('entityPicker.submit')
    expect(picker).toContain('is-selected')
  })
})
