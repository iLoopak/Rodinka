import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(new URL('./index.css', import.meta.url), 'utf8')
const screen = readFileSync(new URL('./components/OfflineFallbackScreen.tsx', import.meta.url), 'utf8')

describe('offline fallback layout contract', () => {
  it('uses a dedicated, equal-width vertical action group', () => {
    expect(screen).toContain('form-actions offline-actions')
    expect(styles).toMatch(/\.offline-actions\s*\{[^}]*flex-direction:\s*column;[^}]*gap:\s*11px;/s)
    expect(styles).toMatch(/\.offline-actions > button\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*center;[^}]*width:\s*100%;[^}]*min-height:\s*48px;/s)
  })

  it('centers a single-column card inside mobile safe areas', () => {
    expect(styles).toMatch(/@media \(max-width: 480px\)\s*\{[\s\S]*?\.offline-state\s*\{[^}]*flex-direction:\s*column;[^}]*align-items:\s*center;/s)
    expect(styles).toMatch(/\.offline-card\s*\{[^}]*width:\s*calc\(100% - 32px\);[^}]*max-width:\s*420px;/s)
    expect(styles).toContain('env(safe-area-inset-left)')
    expect(styles).toContain('env(safe-area-inset-right)')
  })
})
