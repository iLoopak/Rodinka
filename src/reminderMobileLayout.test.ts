/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const css = readFileSync(join(root, 'src/index.css'), 'utf8')
const reminderCenter = readFileSync(join(root, 'src/components/reminders/ReminderCenter.tsx'), 'utf8')
const scrollableTabs = readFileSync(join(root, 'src/components/ui/ScrollableTabs.tsx'), 'utf8')

describe('Reminder Center mobile layout contract', () => {
  it('constrains nested grids and flexible text to the available width', () => {
    expect(reminderCenter).toContain('className="reminder-center"')
    expect(css).toContain('.reminder-settings { display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0;')
    expect(css).toContain('.push-settings { display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0;')
    expect(css).toContain('.push-device span { display: grid; flex: 1 1 auto; min-width: 0;')
    expect(css).toContain('.setting-row > span:not(.status-pill) { display: grid; flex: 1 1 auto; min-width: 0;')
  })

  it('uses one typography and spacing hierarchy throughout reminder settings', () => {
    expect(css).toMatch(/\.reminder-settings \.section-heading\s*\{[^}]*font-size:\s*var\(--font-size-section-title\)[^}]*font-weight:\s*var\(--font-weight-strong\)/s)
    expect(css).toMatch(/\.reminder-settings-panel\s*\{[^}]*padding:\s*0 16px/s)
    expect(css).toMatch(/\.setting-row\s*\{[^}]*margin:\s*0[^}]*padding:\s*14px 0[^}]*font-size:\s*var\(--font-size-item-title\)/s)
    expect(css).toMatch(/\.setting-row small\s*\{[^}]*font-size:\s*var\(--font-size-meta\)[^}]*line-height:\s*var\(--line-height-meta\)/s)
    expect(css).toMatch(/\.setting-row > span:not\(\.status-pill\)/)
  })

  it('uses the shared scrollable tabs primitive without compressing labels', () => {
    expect(reminderCenter).toContain('<ScrollableTabs')
    expect(scrollableTabs).toContain('className="tabs scrollable-tabs"')
    expect(css).toContain('.reminder-center .scrollable-tabs { overflow-x: auto; }')
    expect(css).toContain('.reminder-center .tab-button { flex: 0 0 auto;')
  })

  it('does not mask layout regressions by clipping the app wrapper', () => {
    const appMainRule = css.match(/\.app-main\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(appMainRule).not.toContain('overflow-x')
  })
})
