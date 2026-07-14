import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readSource = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('reminder provider integration contract', () => {
  it('wraps the authenticated application shell rather than only the reminder route', () => {
    const app = readSource('./App.tsx')
    expect(app).toMatch(/<ReminderProvider>[\s\S]*<AppShell \/>[\s\S]*<\/ReminderProvider>/)
  })

  it('refreshes sources on foreground and listens for cross-tab invalidation', () => {
    const provider = readSource('./context/ReminderContext.tsx')
    expect(provider).toContain("document.addEventListener('visibilitychange'")
    expect(provider).toContain('REMINDER_FOREGROUND_REFRESH_MS')
    expect(provider).toContain("window.addEventListener('storage'")
    expect(provider).toContain('refreshReminderSources')
  })

  it('persists drafts and changes state through the constrained RPCs', () => {
    const provider = readSource('./context/ReminderContext.tsx')
    expect(provider).toContain("supabase.rpc('sync_member_reminders'")
    expect(provider).toContain("supabase.rpc('set_member_reminder_state'")
    expect(provider).not.toMatch(/\.from\('reminders'\)\.update\(/)
  })
})
