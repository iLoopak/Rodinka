import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const screen = readFileSync(join(root, 'src/components/CalendarScreen.tsx'), 'utf8')
const styles = readFileSync(join(root, 'src/index.css'), 'utf8')
const strings = readFileSync(join(root, 'src/strings.ts'), 'utf8')

describe('calendar filter disclosure', () => {
  it('keeps filters collapsed behind one accessible header control', () => {
    expect(screen).toContain('const [filtersOpen, setFiltersOpen] = useState(false)')
    expect(screen).toContain('aria-expanded={filtersOpen}')
    expect(screen).toContain('aria-controls="calendar-filter-panel"')
    expect(screen).toContain('hidden={!filtersOpen}')
    expect(screen.match(/className="filter-row"/g)).toHaveLength(1)
  })

  it('signals active filters and keeps clear inside the disclosure', () => {
    expect(screen).toContain('activeFilterCount')
    expect(screen).toContain('calendar-filter-count')
    expect(screen).toContain('onClick={clearFilters}')
    expect(screen).toContain("event.key === 'Escape'")
    expect(styles).toContain('.calendar-filter-panel[hidden] { display: none; }')
    expect(styles).toMatch(/\.calendar-filter-panel\s*\{[^}]*width: 100%/s)
    expect(screen).not.toContain('<strong>{t.calendar.filtersLabel}</strong>')
  })

  it('provides Czech and English accessible labels', () => {
    expect(strings).toContain("showFilters: 'Zobrazit filtry'")
    expect(strings).toContain("hideFilters: 'Skrýt filtry'")
    expect(strings).toContain("showFilters: 'Show filters'")
    expect(strings).toContain("hideFilters: 'Hide filters'")
  })
})
