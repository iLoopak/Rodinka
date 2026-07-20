import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const shell = readFileSync(join(root, 'src/components/AppShell.tsx'), 'utf8')
const statusHook = readFileSync(join(root, 'src/hooks/useRealtimeStatus.ts'), 'utf8')
const registry = readFileSync(join(root, 'src/realtime/realtimeRegistry.ts'), 'utf8')
const connectivity = readFileSync(join(root, 'src/network/connectivity.ts'), 'utf8')

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
