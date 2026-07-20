import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Tap targets below 44px, guarded at the CSS level.
 *
 * The base `button` rule is already 48px and always was. What went wrong was
 * local overrides shrinking shared primitives on individual screens —
 * `.month-nav button.btn-secondary` to 40, `.messages-new-button` to 40,
 * `.list-drag-handle` to 32 wide — with nothing to catch it. Measured in the
 * running app, those were real: 44x40 buttons on the calendar and meals
 * screens, and a 32px-wide drag handle on shopping.
 *
 * This parses the stylesheets rather than the DOM because it has to run in CI
 * without a browser. It cannot see computed layout, so it catches the cause
 * (a declaration) rather than the symptom (a rendered box).
 */

const MINIMUM = 44

const FILES = [
  'src/index.css',
  'src/styles/base.css',
  'src/components/messages/messages.css',
]

/**
 * Selectors that plausibly render something a finger has to hit.
 *
 * Known limitation: a class with no interactive-sounding word in it — say
 * `.calendar-day-close` on a `<button>` — is invisible to a stylesheet parser,
 * because the element type lives in the JSX, not the CSS. This guard catches
 * the common shapes, not every possible one.
 */
// The keyword can appear anywhere in the class name: `.vote-button` and
// `.tag-toggle` are as interactive as `.button` and `.toggle`, and an earlier
// version of this pattern anchored to the start and missed both.
const INTERACTIVE = /(^|[\s,>+~])(button|a|input|select|\[role=["']?button)|\.[a-z-]*(btn|button|link|toggle|handle|tab|chip|pill|action|checkbox)[a-z-]*/i

/**
 * Known offenders that predate this guard. Each one still has to be either
 * measured and fixed or justified — the list may shrink, never grow.
 */
const BASELINE = new Set([
  '.guided-segmented.compact button',
  '.guided-shortcut, .guided-suggestion-row button, .guided-text-action',
  '.messages-back-button',
  '.shopping-category-setting input[type="text"], .shopping-category-setting input:not([type])',
  '.shopping-template-list button',
  '.shopping-toolbar button',
  '.guided-text-action',
  '.today-quick-todo-undo button',
  '.vote-button',
  '.tab-button',
  '.weekday-picker.compact .weekday-toggle',
  '.weekday-toggle, .tag-toggle',
  'button.profile-email-copy',
])

interface Offender { file: string; selector: string; prop: string; value: number }

function findOffenders(): Offender[] {
  const offenders: Offender[] = []
  for (const file of FILES) {
    const css = readFileSync(join(process.cwd(), file), 'utf8')
    // Deliberately simple: selector text up to `{`, then the block.
    const rulePattern = /([^{}]+)\{([^{}]*)\}/g
    let match: RegExpExecArray | null
    while ((match = rulePattern.exec(css)) !== null) {
      const selector = match[1].replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/\s+/g, ' ')
      if (!selector || selector.startsWith('@') || !INTERACTIVE.test(selector)) continue
      for (const prop of ['min-height', 'min-width'] as const) {
        const declaration = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([\\d.]+)px`, 'i').exec(match[2])
        if (!declaration) continue
        const value = Number(declaration[1])
        if (value > 0 && value < MINIMUM) offenders.push({ file, selector, prop, value })
      }
    }
  }
  return offenders
}

describe('tap target contract', () => {
  it('introduces no new interactive rule below 44px', () => {
    const unexpected = findOffenders().filter((offender) => !BASELINE.has(offender.selector))
    expect(unexpected.map((o) => `${o.file}: ${o.selector} { ${o.prop}: ${o.value}px }`)).toEqual([])
  })

  it('keeps the three screens fixed in this wave clear', () => {
    // Measured under a real browser at 390x844 and 320x568 before and after.
    const offenders = findOffenders().map((o) => o.selector)
    expect(offenders).not.toContain('.month-nav button.btn-secondary')
    expect(offenders).not.toContain('.messages-new-button')
    expect(offenders).not.toContain('.list-drag-handle')
  })

  it('has a baseline that only shrinks', () => {
    // Every entry must still exist; a fixed one has to leave the list so it
    // cannot silently regress later.
    const selectors = new Set(findOffenders().map((o) => o.selector))
    const stale = [...BASELINE].filter((entry) => !selectors.has(entry))
    expect(stale).toEqual([])
  })

  it('leaves the base button rule alone', () => {
    // The default has always been fine; this guard is about local overrides.
    const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8')
    expect(css).toMatch(/button\s*\{[^}]*min-height:\s*48px/)
  })
})
