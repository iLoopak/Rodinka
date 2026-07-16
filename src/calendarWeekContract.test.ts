import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const screen = readFileSync(join(root, 'src/components/CalendarScreen.tsx'), 'utf8')
const tabs = readFileSync(join(root, 'src/components/ui/ScrollableTabs.tsx'), 'utf8')
const week = readFileSync(join(root, 'src/components/calendar/WeekAgenda.tsx'), 'utf8')
const dayCard = readFileSync(join(root, 'src/components/calendar/CalendarDayAgendaCard.tsx'), 'utf8')
const entryRow = readFileSync(join(root, 'src/components/calendar/WeekCalendarEntryRow.tsx'), 'utf8')
const styles = readFileSync(join(root, 'src/index.css'), 'utf8')

describe('weekly calendar integration contracts', () => {
  it('keeps month, week, and overview as accessible tabs', () => {
    expect(screen).toContain("type ViewMode = 'month' | 'week' | 'agenda'")
    expect(screen).toContain('<ScrollableTabs tabs={viewTabs} activeTab={viewMode}')
    expect(screen.match(/id: '(month|week|agenda)'/g)).toHaveLength(3)
    expect(tabs).toContain('role="tab"')
    expect(tabs).toContain('aria-selected={activeTab === tab.id}')
  })

  it('preserves the existing event deep-link path for weekly rows', () => {
    expect(screen).toContain("setQueryParam('event', entry.sourceId)")
    expect(screen).toContain("processedDeepLinkRef.current = `${dateParam ?? ''}|${entry.sourceId}`")
    expect(screen).toContain('onSelectEntry={openEntry}')
    expect(screen).toContain('CalendarEntryDetailModal')
  })

  it('returns Today to the current weekly day and requests scrolling', () => {
    expect(screen).toContain('setWeekStart(getWeekStart(today))')
    expect(screen).toContain('setSelectedWeekDay(today)')
    expect(screen).toContain('setWeekScrollVersion((version) => version + 1)')
  })

  it('selects strip days, scrolls to their agenda, and exposes seven day sections', () => {
    expect(week).toContain('aria-pressed={selected}')
    expect(week).toContain('onSelectDay(date)')
    expect(week).toContain("scrollIntoView({ behavior: 'smooth', block: 'start' })")
    expect(dayCard).toContain('data-week-date={exposeWeekDate ? date : undefined}')
  })

  it('keeps every week width in one full-width vertical agenda', () => {
    const weekListRule = styles.match(/\.week-day-list\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(week).toContain('data-layout="vertical-agenda"')
    expect(weekListRule).toContain('display: flex')
    expect(weekListRule).toContain('flex-direction: column')
    expect(weekListRule).toContain('width: 100%')
    expect(styles).not.toMatch(/\.week-day-list\s*\{[^}]*grid-template-columns/s)
    expect(styles).not.toMatch(/\.week-day-list[^}]*repeat\(2/s)
  })

  it('keeps lightweight empty content, one shared footer action, and stacked event rows', () => {
    expect(dayCard).toContain('className="week-day-empty"')
    expect(dayCard).not.toContain('week-day-add-small')
    expect(dayCard.match(/className="link week-day-add"/g)).toHaveLength(1)
    expect(dayCard.match(/onClick=\{\(\) => onAddDay\(date\)\}/g)).toHaveLength(1)
    expect(dayCard).toContain('untimed.map')
    expect(dayCard).toContain('timed.map')
    expect(styles).toContain('.week-day-group ul { display: grid;')
    expect(styles).not.toContain('.week-day-add-small')
  })

  it('uses a mobile-first vertical event hierarchy without legacy side columns', () => {
    const layoutRule = styles.match(/\.week-entry-layout\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(entryRow).toContain('className="week-entry-heading"')
    expect(entryRow).toContain('className="week-entry-time font-tabular"')
    expect(entryRow).toContain('className="week-entry-metadata"')
    expect(entryRow).not.toContain('DueBadge')
    expect(entryRow).not.toContain('week-entry-side')
    expect(entryRow).not.toContain('avatar-stack')
    expect(layoutRule).not.toContain('grid-template-columns')
    expect(styles).not.toContain('.week-entry-button')
  })

  it('keeps the companion switch compact and inside the event content', () => {
    expect(entryRow).toContain('<MemberAvatar member={responsible} size={30} />')
    expect(entryRow).toContain('className="week-entry-swap"')
    expect(entryRow).toContain('className="week-entry-override-dot"')
    expect(styles).toContain('min-height: 44px')
  })

  it('does not repeat participant avatars in day headers', () => {
    expect(dayCard).not.toContain('week-day-avatars')
  })

  it('shares the same day agenda card between month and week views', () => {
    expect(screen).toContain('<CalendarDayAgendaCard')
    expect(week).toContain('<CalendarDayAgendaCard')
    expect(screen).not.toContain('calendar-day-agenda')
  })

  it('uses the same filtered entry collection as the other calendar views', () => {
    expect(screen).toContain('const entries = useMemo(() => {')
    expect(screen).toContain('entryMatchesMember(entry, filterPerson)')
    expect(screen).toContain('entry.type === filterType')
    expect(screen).toContain('entries={entries}')
  })
})
