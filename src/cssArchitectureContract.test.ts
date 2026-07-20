import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const index = read('src/index.css')
const tokens = read('src/styles/tokens.css')
const base = read('src/styles/base.css')
const chat = read('src/components/messages/messages.css')
const familyJump = read('src/features/family-jump/familyJump.css')
const messagesScreen = read('src/components/messages/MessagesScreen.tsx')

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

// Keyframe steps (`from`, `to`, `50%`) and at-rule preludes (`@media …`) are
// not selectors; counting them as such is what makes a naive CSS check noisy.
const KEYFRAME_STEP = /^(from|to|\d+(\.\d+)?%)$/

/**
 * The element name a selector applies to globally, or null when the selector is
 * anchored by a class, id or attribute. `button.family-jump-back` is scoped;
 * a bare `button` is not.
 */
function unscopedElement(selector: string): string | null {
  const firstCompound = selector.split(/[\s>+~]/)[0]
  if (/[.#[]/.test(firstCompound)) return null
  const element = firstCompound.replace(/:.*$/, '').trim()
  return /^[a-z*]+$/.test(element) ? element : null
}

function selectorsOf(css: string): string[] {
  const out: string[] = []
  const re = /(^|[{};])\s*([^{};]+?)\s*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(stripComments(css)))) {
    for (const part of m[2].split(',').map((s) => s.trim())) {
      if (!part || part.startsWith('@') || KEYFRAME_STEP.test(part)) continue
      out.push(part)
    }
  }
  return out
}

describe('stylesheet layering', () => {
  it('loads tokens and element defaults before any feature rule', () => {
    // The @import order IS the cascade order — anything moved above them would
    // silently start losing to rules it used to beat. CSS also requires
    // @import to precede every other statement.
    const stripped = stripComments(index)
    const tokensAt = stripped.indexOf("@import './styles/tokens.css'")
    const baseAt = stripped.indexOf("@import './styles/base.css'")
    expect(tokensAt).toBeGreaterThan(-1)
    expect(baseAt).toBeGreaterThan(tokensAt)
    expect(stripped.indexOf('{')).toBeGreaterThan(baseAt)
  })

  it('keeps tokens a pure variable declaration block', () => {
    expect(selectorsOf(tokens)).toEqual([':root'])
    expect(stripComments(tokens)).not.toMatch(/^\s*\.[a-z]/m)
  })

  it('keeps base to element defaults and shared utilities', () => {
    // `.font-tabular` and friends are typography utilities used across every
    // feature — a feature-specific class here would be the smell.
    for (const selector of selectorsOf(base)) {
      if (!selector.startsWith('.')) continue
      expect(selector, `base.css should only hold shared utilities: ${selector}`).toMatch(/^\.(font|sr-only|visually-hidden)/)
    }
  })
})

describe('route-scoped feature CSS', () => {
  it('ships chat styling with the Messages route chunk', () => {
    expect(messagesScreen).toContain("import './messages.css'")
    expect(selectorsOf(chat).length).toBeGreaterThan(100)
  })

  it('keeps chat rules out of the main sheet, except the parts rendered elsewhere', () => {
    // The header bell is on every screen and the share sheet opens from
    // Shopping, chores and activities — their styling has to stay global.
    const globalChat = ['.messages-bell', '.messages-badge', '.messages-share']
    for (const selector of selectorsOf(index)) {
      if (!selector.includes('.messages-')) continue
      expect(globalChat.some((c) => selector.includes(c)), `unexpected chat rule in main sheet: ${selector}`).toBe(true)
    }
  })

  it('never lets a route sheet claim a class the always-mounted chat entry points use', () => {
    const bell = read('src/components/messages/MessagesBell.tsx')
    const share = read('src/components/messages/ShareToChatButton.tsx')
    const routeClasses = [...new Set([...chat.matchAll(/\.(messages-[a-z0-9-]+)/g)].map((m) => m[1]))]
    const leaked = routeClasses.filter((c) => bell.includes(c) || share.includes(c))
    expect(leaked).toEqual([])
  })

  it('keeps Family Jump styling with its own chunk', () => {
    expect(familyJump.length).toBeGreaterThan(0)
    for (const selector of selectorsOf(index)) {
      expect(selector, `Family Jump rule leaked into the main sheet: ${selector}`).not.toMatch(/\.family-jump|\.fj-/)
    }
  })
})

describe('global selector safety', () => {
  it('adds no new unscoped element selector to the main sheet', () => {
    // index.css legitimately styles bare form controls in its Buttons and
    // Forms sections — that predates this wave and is not worth unpicking.
    // What this guards is growth: a NEW bare `div {}` or `* {}` reaches every
    // screen at once, so adding one must be a deliberate act that also
    // updates this list.
    const allowed = ['a', 'button', 'form', 'input', 'label', 'main', 'select', 'textarea']
    const found = new Set<string>()
    for (const selector of selectorsOf(index)) {
      const element = unscopedElement(selector)
      if (element) found.add(element)
    }
    expect([...found].sort()).toEqual(allowed)
  })

  it('keeps route sheets entirely class-scoped', () => {
    // A route sheet loads late and is never unloaded — one bare element rule
    // in it would leak onto every screen the user visits afterwards.
    for (const [name, sheet] of [['messages.css', chat], ['familyJump.css', familyJump]] as const) {
      const leaked = selectorsOf(sheet).filter((s) => unscopedElement(s))
      expect(leaked, `${name} must not style bare elements`).toEqual([])
    }
  })

  it('has no stylesheet outside the sanctioned locations', () => {
    const found: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`
        if (entry.isDirectory()) walk(rel)
        else if (entry.name.endsWith('.css')) found.push(rel)
      }
    }
    walk('src')
    expect(found.sort()).toEqual([
      'src/components/messages/messages.css',
      'src/features/family-jump/familyJump.css',
      'src/index.css',
      'src/styles/base.css',
      'src/styles/tokens.css',
    ])
  })
})

describe('stylesheet integrity', () => {
  it.each([
    ['src/index.css', index],
    ['src/styles/tokens.css', tokens],
    ['src/styles/base.css', base],
    ['src/components/messages/messages.css', chat],
  ])('%s has balanced braces and comments', (_name, css) => {
    expect((css.match(/\{/g) ?? []).length).toBe((css.match(/\}/g) ?? []).length)
    expect((css.match(/\/\*/g) ?? []).length).toBe((css.match(/\*\//g) ?? []).length)
  })
})
