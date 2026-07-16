import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const screen = readFileSync(join(root, 'src/components/CalendarScreen.tsx'), 'utf8')
const disclosure = readFileSync(join(root, 'src/components/ui/FilterDisclosure.tsx'), 'utf8')
const styles = readFileSync(join(root, 'src/index.css'), 'utf8')
const strings = readFileSync(join(root, 'src/strings.ts'), 'utf8')

describe('calendar filter disclosure', () => {
  it('keeps filters collapsed behind one accessible header control', () => {
    expect(screen).toContain('const [filtersOpen, setFiltersOpen] = useState(false)')
    expect(screen).toContain('<FilterDisclosure id="calendar-filter-panel" open={filtersOpen}')
    expect(disclosure).toContain('aria-expanded={open}')
    expect(disclosure).toContain('aria-controls={id}')
    expect(disclosure).toContain('hidden={!open}')
    expect(screen.match(/className="filter-row"/g)).toHaveLength(1)
  })

  it('signals active filters and keeps clear inside the disclosure', () => {
    expect(screen).toContain('activeFilterCount')
    expect(disclosure).toContain('filter-active-count')
    expect(screen).toContain('onClear={clearFilters}')
    expect(disclosure).toContain("event.key === 'Escape'")
    expect(styles).toContain('.filter-disclosure-panel[hidden] { display: none; }')
    expect(screen).not.toContain('<strong>{t.calendar.filtersLabel}</strong>')
  })

  it('provides Czech and English accessible labels', () => {
    expect(strings).toContain("showFilters: 'Zobrazit filtry'")
    expect(strings).toContain("hideFilters: 'Skrýt filtry'")
    expect(strings).toContain("showFilters: 'Show filters'")
    expect(strings).toContain("hideFilters: 'Hide filters'")
  })
})
