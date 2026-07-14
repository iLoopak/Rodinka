import type { ActivityRecurrenceType } from '../../hooks/useActivities'
import { t } from '../../strings'
import { activityWeekdayOptions } from '../../utils/activityLabels'
import { selectedRecurrenceWeekdays } from '../../utils/activityFormModel'

interface Props {
  value: ActivityRecurrenceType
  startDate: string
  weekdays: number[]
  invalid?: boolean
  onChange: (value: ActivityRecurrenceType) => void
  onToggleWeekday: (day: number) => void
}

export function ActivityRecurrencePicker({ value, startDate, weekdays, invalid = false, onChange, onToggleWeekday }: Props) {
  const options: Array<{ value: ActivityRecurrenceType; label: string }> = [
    { value: 'one_off', label: t.activities.recurrenceNoneCompact },
    { value: 'weekly', label: t.activities.recurrenceWeeklyCompact },
    { value: 'biweekly', label: t.activities.recurrenceBiweeklyCompact },
    { value: 'custom_weekdays', label: t.activities.recurrenceCustomCompact },
  ]
  const selectedDays = selectedRecurrenceWeekdays(value, startDate, weekdays)
  const showWeekdays = value === 'weekly' || value === 'biweekly' || value === 'custom_weekdays'

  return <div className="activity-recurrence">
    <span className="activity-field-label">{t.activities.recurrenceLabel}</span>
    <div className="recurrence-chip-grid" role="group" aria-label={t.activities.recurrenceLabel}>
      {options.map((option) => <button
        key={option.value}
        type="button"
        className={`recurrence-chip${value === option.value ? ' selected' : ''}`}
        aria-pressed={value === option.value}
        onClick={() => onChange(option.value)}
      >{option.label}</button>)}
    </div>
    {showWeekdays && <div className="weekday-picker compact" role="group" aria-label={t.activities.weekdaysLabel} aria-invalid={invalid || undefined}>
      {activityWeekdayOptions().map((option) => {
        const selected = selectedDays.includes(option.value)
        const anchored = value !== 'custom_weekdays'
        return <button
          key={option.value}
          type="button"
          className={`weekday-toggle${selected ? ' active' : ''}`}
          aria-pressed={selected}
          title={anchored ? t.activities.weekdayAnchorHelp : undefined}
          onClick={() => {
            if (anchored) onChange('custom_weekdays')
            onToggleWeekday(option.value)
          }}
        >{option.label}</button>
      })}
    </div>}
  </div>
}
