import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const css = readFileSync(join(root, 'src/index.css'), 'utf8')
const modalPrimitiveCss = readFileSync(join(root, 'src/styles/primitives/modal.css'), 'utf8')
const editor = readFileSync(join(root, 'src/components/family/MemberProfileModal.tsx'), 'utf8')
const modal = readFileSync(join(root, 'src/components/ui/Modal.tsx'), 'utf8')
const screenLockHook = readFileSync(join(root, 'src/hooks/useScreenLock.ts'), 'utf8')

describe('member editor mobile layout contract', () => {
  it('uses a stable dynamic-viewport flex sheet', () => {
    // The height/scroll contract lives on the shared `.modal-sheet-fullscreen`
    // primitive; the editor opts in via `size="fullscreen"` rather than
    // reimplementing it.
    expect(editor).toMatch(/<Modal[\s\S]*?size="fullscreen"[\s\S]*?className="member-editor-sheet"/)
    expect(modalPrimitiveCss).toMatch(/\.modal-sheet\.modal-sheet-fullscreen\s*\{[^}]*height:\s*calc\(100dvh - var\(--keyboard-inset, 0px\)\)[^}]*max-height:\s*calc\(100dvh - var\(--keyboard-inset, 0px\)\)[^}]*overflow:\s*hidden[^}]*(?:padding|border-radius)/s)
    expect(css).toMatch(/\.modal-sheet\.member-editor-sheet\s*\{[^}]*min-height:\s*0/s)
    expect(css).toMatch(/\.member-editor-main\s*\{[^}]*min-height:\s*0[^}]*overflow:\s*hidden/s)
  })

  it('makes only the active section vertically scrollable', () => {
    expect(css).toMatch(/\.member-editor-content\s*\{[^}]*flex:\s*1 1 auto[^}]*min-height:\s*0[^}]*overflow-y:\s*auto[^}]*-webkit-overflow-scrolling:\s*touch/s)
    expect(css).toMatch(/\.member-editor-footer\s*\{[^}]*flex:\s*0 0 auto[^}]*env\(safe-area-inset-bottom\)[^}]*border-top/s)
  })

  it('keeps narrow tab labels intact and horizontally reachable', () => {
    expect(css).toMatch(/\.member-editor-nav\s*\{[^}]*overflow-x:\s*auto[^}]*overflow-y:\s*hidden/s)
    expect(css).toMatch(/\.member-editor-nav-item\s*\{[^}]*flex:\s*0 0 auto[^}]*min-width:\s*max-content[^}]*white-space:\s*nowrap/s)
    expect(css).toMatch(/\.member-editor-nav-item\.is-active\s*\{[^}]*color:\s*#fff/s)
  })

  it('portals the editor above the app shell and locks background scrolling', () => {
    expect(editor).toContain('backdropClassName="member-editor-backdrop"')
    expect(modal).toContain('createPortal(')
    // The lock itself lives in the shared `useScreenLock` hook (also used by
    // the fullscreen chat portal and the fullscreen game routes) rather than
    // being reimplemented inline in Modal.
    expect(modal).toContain('useScreenLock()')
    expect(screenLockHook).toContain("document.body.classList.add('has-modal-open')")
    expect(css).toMatch(/body\.has-modal-open \.app-main\s*\{[^}]*overflow:\s*hidden/s)
  })
})
