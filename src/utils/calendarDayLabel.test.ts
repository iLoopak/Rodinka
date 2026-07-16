import { afterEach, describe, expect, it } from 'vitest'
import { changeLanguage } from '../i18n'
import { calendarDayAriaLabel } from './calendarDayLabel'

describe('calendarDayAriaLabel', () => {
  afterEach(async () => { await changeLanguage('cs') })

  it('uses Czech zero, one and multiple item wording with state', async () => {
    await changeLanguage('cs')
    expect(calendarDayAriaLabel('2026-07-16', 0)).toContain('0 položek')
    expect(calendarDayAriaLabel('2026-07-16', 1, { today: true, selected: true })).toMatch(/1 položka.*dnes.*vybráno/)
    expect(calendarDayAriaLabel('2026-07-16', 3)).toContain('3 položky')
  })

  it('uses English localized date and count wording', async () => {
    await changeLanguage('en')
    expect(calendarDayAriaLabel('2026-07-16', 0)).toMatch(/Thursday.*0 items/)
    expect(calendarDayAriaLabel('2026-07-16', 1, { today: true })).toMatch(/1 item.*today/)
  })
})
