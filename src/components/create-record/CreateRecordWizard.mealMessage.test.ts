import { describe, expect, it } from 'vitest'
import { mealDateLabel } from './CreateRecordWizard'
import { addDays, todayISODate } from '../../utils/dueDate'
import { t } from '../../strings'

describe('mealDateLabel', () => {
  it('labels today and tomorrow relatively, everything else as a numeric date', () => {
    const today = todayISODate()
    expect(mealDateLabel(today)).toBe(t.mealPlan.todayRelativeLabel)
    expect(mealDateLabel(addDays(today, 1))).toBe(t.mealPlan.tomorrowRelativeLabel)
    expect(mealDateLabel(addDays(today, 10))).not.toBe(t.mealPlan.todayRelativeLabel)
    expect(mealDateLabel(addDays(today, 10))).not.toBe(t.mealPlan.tomorrowRelativeLabel)
  })

  it('formats a manually chosen date as "day. month. year." (the spec\'s own example shape)', () => {
    expect(mealDateLabel(addDays(todayISODate(), 30))).toMatch(/^\d{1,2}\. \d{1,2}\. \d{4}$/)
  })
})

describe('meal-add success copy', () => {
  it('matches the spec\'s exact tomorrow example', () => {
    const body = t.mealPlan.addedSuccessBody('Fazole alá chilli con carne', t.mealPlan.tomorrowRelativeLabel)
    expect(body).toBe('Fazole alá chilli con carne je naplánované na zítřek.')
  })

  it('matches the spec\'s exact specific-date example', () => {
    const body = t.mealPlan.addedSuccessBody('Jídlo', '24. 7. 2026')
    expect(body).toBe('Jídlo je naplánované na 24. 7. 2026.')
  })
})
