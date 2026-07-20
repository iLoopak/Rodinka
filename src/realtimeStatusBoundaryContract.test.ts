import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

// Matching a multi-line snippet against source is line-ending sensitive: the
// checks below passed while the files carried LF and broke the moment git
// checked them back out with CRLF on Windows.
function readSource(relativePath: string) {
  return readFileSync(join(root, relativePath), 'utf8').split('\r\n').join('\n')
}

const shell = readSource('src/components/AppShell.tsx')
const statusHook = readSource('src/hooks/useRealtimeStatus.ts')
const registry = readSource('src/realtime/realtimeRegistry.ts')
const connectivity = readSource('src/network/connectivity.ts')

describe('AppShell realtime status boundaries', () => {
  it('uses data-free status and active-conversation snapshots instead of broad feature hooks', () => {
    expect(shell).not.toMatch(/\buseShopping\(/)
    expect(shell).not.toMatch(/\buseCalendarOffline\(/)
    expect(shell).not.toMatch(/\buseMessagesData\(/)
    expect(shell).toContain('useActiveConversationId()')
    expect(shell).toContain('useConversationPushBridge(activeConversationId)')
    expect(statusHook).toContain('useRealtimeOverallStatus()')
  })

  it('reads connectivity from the centralized snapshot rather than composing it inline', () => {
    expect(shell).toContain('useConnectivityState()')
    // The three signals AppShell used to combine by hand now belong to
    // connectivity.ts. Regressing any of them back into the shell reintroduces
    // the unsubscribed navigator.onLine read and the feature-state bleed
    // that made one stuck queue black out unrelated routes (audit P1-7).
    expect(shell).not.toContain('navigator.onLine')
    expect(shell).not.toContain('useShoppingSyncStatus()')
    expect(shell).not.toContain('useCalendarSyncStatus()')
  })

  it('keeps the offline/degraded distinction inside the connectivity module', () => {
    expect(connectivity).toContain("realtimeState === 'reconnecting'")
    // Only the browser may declare `offline`; a backend problem is `degraded`.
    expect(connectivity).toContain("!browserOnline\n    ? 'offline'")
    expect(connectivity).toContain("'degraded'")
  })

  it('keeps reconnect UI driven by the narrow status and diagnostics guarded to development', () => {
    expect(shell).toContain('<RealtimeStatusBadge status={realtimeStatus} />')
    expect(registry).toContain('import.meta.env.DEV')
    expect(registry).not.toMatch(/payload|userId|memberId/)
  })
})
