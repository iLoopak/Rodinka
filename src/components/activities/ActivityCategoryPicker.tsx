import { activityCategoryIcon } from '../../utils/activityCategoryIcon'
import { ACTIVITY_CATEGORY_VALUES, activityCategoryLabel } from '../../utils/activityLabels'
import type { ActivityCategory } from '../../features/activities/domain/activityTypes'
import { t } from '../../strings'

interface Props {
  value: ActivityCategory
  onChange: (category: ActivityCategory) => void
}

// Same chip-grid shape as ActivityParticipantPicker, but single-select
// (radiogroup) rather than multi-select — picking a category doubles as
// picking the icon that represents it everywhere the activity appears.
export function ActivityCategoryPicker({ value, onChange }: Props) {
  return <div className="activity-category-chip-grid" role="radiogroup" aria-label={t.activities.categoryLabel}>
    {ACTIVITY_CATEGORY_VALUES.map((category) => {
      const Icon = activityCategoryIcon(category)
      const selected = category === value
      return <button
        key={category}
        type="button"
        role="radio"
        aria-checked={selected}
        className={`activity-category-chip${selected ? ' selected' : ''}`}
        onClick={() => onChange(category)}
      >
        <Icon size={20} aria-hidden="true" />
        <span>{activityCategoryLabel(category)}</span>
        <span className="activity-category-chip-check" aria-hidden="true">✓</span>
      </button>
    })}
  </div>
}
