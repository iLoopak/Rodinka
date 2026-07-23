import { getItemTypeStyle, type CalendarItemType } from '../../utils/itemTypeStyle'
import type { ActivityCategory } from '../../features/activities/domain/activityTypes'

interface Props {
  type: CalendarItemType
  /** Picks the right icon for an activity (e.g. swimming vs. football) instead of the generic fallback. */
  category?: ActivityCategory
  size?: number
}

// The one shared "item type" identity mark used across calendar, today,
// planner, and the create modal: a tinted icon container instead of a
// colored border/stripe. Background is a 10%-opacity tint of the type
// color, icon glyph is the full type color, no border, no shadow.
export function ItemTypeIcon({ type, category, size = 40 }: Props) {
  const { colorVar, Icon } = getItemTypeStyle(type, category)
  const radius = Math.round(size * 0.325)
  const iconSize = Math.round(size * 0.55)

  return (
    <span
      className="item-type-icon"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: `color-mix(in srgb, var(${colorVar}) 10%, transparent)`,
        color: `var(${colorVar})`,
      }}
      aria-hidden="true"
    >
      <Icon size={iconSize} strokeWidth={2} />
    </span>
  )
}
