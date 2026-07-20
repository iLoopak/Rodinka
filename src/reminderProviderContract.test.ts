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
    // The two RPCs moved into the repository in Wave 3, but the invariant is
    // unchanged and is the point of this test: reminder state is only ever
    // written through them. They enforce the allowed transitions server-side,
    // so a direct table write would bypass that.
    const repository = readSource('./features/reminders/data/supabaseReminderRepository.ts')
    expect(repository).toContain("supabase.rpc('sync_member_reminders'")
    expect(repository).toContain("supabase.rpc('set_member_reminder_state'")
    expect(repository).not.toMatch(/from\('reminders'\)[\s\S]{0,120}\.update\(/)
    expect(repository).not.toMatch(/from\('reminders'\)[\s\S]{0,120}\.delete\(/)
  })

  it('keeps the provider free of direct Supabase access', () => {
    const provider = readSource('./context/ReminderContext.tsx')
    expect(provider).not.toMatch(/\bsupabase\.(from|rpc|channel)\(/)
  })

  it('reads a small summary for the bell rather than the whole list', () => {
    // The bell renders two numbers. It used to derive them from every
    // reminder's full row, titles and metadata included.
    const mappers = readSource('./features/reminders/domain/reminderMappers.ts')
    expect(mappers).toContain('REMINDER_SUMMARY_COLUMNS')
    expect(mappers).not.toContain("select('*')")
    for (const heavy of ['title', 'description', 'metadata', 'deep_link']) {
      const summaryLine = mappers.split('\n').find((line) => line.includes('REMINDER_SUMMARY_COLUMNS =')) ?? ''
      expect(summaryLine).not.toContain(heavy)
    }
  })
})
