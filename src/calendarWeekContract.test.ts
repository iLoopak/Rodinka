import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const screen = readFileSync(join(root, 'src/components/CalendarScreen.tsx'), 'utf8')
const week = readFileSync(join(root, 'src/components/calendar/WeekAgenda.tsx'), 'utf8')
const styles = readFileSync(join(root, 'src/index.css'), 'utf8')

describe('weekly calendar integration contracts', () => {
  it('keeps month, week, and overview as accessible tabs', () => {
    expect(screen).toContain("type ViewMode = 'month' | 'week' | 'agenda'")
    expect(screen.match(/role="tab"/g)).toHaveLength(3)
    expect(screen).toContain('aria-selected={viewMode === \'week\'}')
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
    expect(week).toContain('data-week-date={day.date}')
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

  it('keeps compact empty-day creation and stacked event rows', () => {
    expect(week).toContain('className="week-day-empty"')
    expect(week).toContain('className="week-day-add-small"')
    expect(week).toContain('day.untimed.map')
    expect(week).toContain('day.timed.map')
    expect(styles).toContain('.week-day-group ul { display: grid;')
  })

  it('uses the same filtered entry collection as the other calendar views', () => {
    expect(screen).toContain('const entries = useMemo(() => {')
    expect(screen).toContain('entryMatchesMember(entry, filterPerson)')
    expect(screen).toContain('entry.type === filterType')
    expect(screen).toContain('entries={entries}')
  })
})
