import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const shell = readFileSync(join(root, 'src/components/AppShell.tsx'), 'utf8')
const statusHook = readFileSync(join(root, 'src/hooks/useRealtimeStatus.ts'), 'utf8')
const registry = readFileSync(join(root, 'src/realtime/realtimeRegistry.ts'), 'utf8')

describe('AppShell realtime status boundaries', () => {
  it('uses data-free status and active-conversation snapshots instead of broad feature hooks', () => {
    expect(shell).not.toMatch(/\buseShopping\(/)
    expect(shell).not.toMatch(/\buseCalendarOffline\(/)
    expect(shell).not.toMatch(/\buseMessagesData\(/)
    expect(shell).toContain('useShoppingSyncStatus()')
    expect(shell).toContain('useCalendarSyncStatus()')
    expect(shell).toContain('useActiveConversationId()')
    expect(shell).toContain('useConversationPushBridge(activeConversationId)')
    expect(statusHook).toContain('useRealtimeOverallStatus()')
  })

  it('keeps reconnect UI driven by the narrow status and diagnostics guarded to development', () => {
    expect(shell).toContain("realtimeStatus === 'reconnecting'")
    expect(shell).toContain('<RealtimeStatusBadge status={realtimeStatus} />')
    expect(registry).toContain('import.meta.env.DEV')
    expect(registry).not.toMatch(/payload|userId|memberId/)
  })
})
