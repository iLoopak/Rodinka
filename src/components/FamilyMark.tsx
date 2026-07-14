import { useId } from 'react'
import type { FamilyMember } from '../hooks/useFamilyMembers'
import { memberColorVar } from '../utils/memberColor'
import {
  createFamilyMarkModel,
  createFamilyMarkSlots,
  FAMILY_MARK_VIEW_BOX_SIZE,
  STATIC_FAMILY_MARK_COLORS,
  type FamilyMarkSlot,
} from '../utils/familyMark'

export type FamilyMarkMember = Pick<FamilyMember, 'id' | 'color_key'>

interface SharedProps {
  size?: number
  className?: string
  decorative?: boolean
  label?: string
}

interface StaticProps extends SharedProps {
  variant: 'static'
  members?: never
  loading?: never
}

interface DynamicProps extends SharedProps {
  variant: 'dynamic'
  members: FamilyMarkMember[]
  loading?: boolean
}

export type FamilyMarkProps = StaticProps | DynamicProps

function Petal({ slot, fill, className }: { slot: FamilyMarkSlot; fill: string; className?: string }) {
  const radius = slot.size * 0.34
  return <rect
    className={className}
    x={slot.cx - slot.size / 2}
    y={slot.cy - slot.size / 2}
    width={slot.size}
    height={slot.size}
    rx={radius}
    fill={fill}
    transform={`rotate(${slot.rotation} ${slot.cx} ${slot.cy})`}
  />
}

export function FamilyMark(props: FamilyMarkProps) {
  const {
    size = 32,
    className,
    decorative = true,
    label,
  } = props
  const dynamic = props.variant === 'dynamic'
  const loading = dynamic && Boolean(props.loading)
  const members = dynamic && !loading ? props.members : []
  const model = createFamilyMarkModel(members)
  const staticSlots = createFamilyMarkSlots(4)
  const gradientId = `family-mark-${useId().replace(/:/g, '')}`
  const classes = ['family-mark', `family-mark-${props.variant}`, loading ? 'is-loading' : '', className ?? '']
    .filter(Boolean)
    .join(' ')
  const accessibility = decorative
    ? { 'aria-hidden': true as const }
    : { role: 'img', 'aria-label': label ?? 'Rodinka' }

  return <svg
    className={classes}
    width={size}
    height={size}
    viewBox={`0 0 ${FAMILY_MARK_VIEW_BOX_SIZE} ${FAMILY_MARK_VIEW_BOX_SIZE}`}
    preserveAspectRatio="xMidYMid meet"
    shapeRendering="geometricPrecision"
    focusable="false"
    fill="none"
    data-member-count={dynamic && !loading ? props.members.length : undefined}
    {...accessibility}
  >
    {props.variant === 'static' && staticSlots.map((slot, index) => <Petal
      key={STATIC_FAMILY_MARK_COLORS[index]}
      slot={slot}
      fill={STATIC_FAMILY_MARK_COLORS[index]}
      className="family-mark-petal"
    />)}

    {loading && <>
      <circle className="family-mark-loading-ring" cx="32" cy="32" r="22" />
      <Petal slot={createFamilyMarkSlots(1)[0]} fill="var(--neutral-soft)" className="family-mark-loading-petal" />
    </>}

    {dynamic && !loading && <>
      {model.overflowMembers.length > 0 && <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          {model.overflowMembers.map((member, index) => <stop
            key={member.id}
            offset={model.overflowMembers.length === 1 ? 0 : index / (model.overflowMembers.length - 1)}
            stopColor={`var(${memberColorVar(member)})`}
          />)}
        </linearGradient>
      </defs>}
      {model.visibleMembers.map((member, index) => <Petal
        key={member.id}
        slot={model.slots[index]}
        fill={`var(${memberColorVar(member)})`}
        className="family-mark-petal"
      />)}
      {model.overflowMembers.length > 0 && <>
        <Petal slot={model.slots[5]} fill={`url(#${gradientId})`} className="family-mark-petal family-mark-overflow" />
        {size >= 32 && <text className="family-mark-overflow-label" x={model.slots[5].cx} y={model.slots[5].cy}>
          +{model.overflowMembers.length}
        </text>}
      </>}
    </>}
  </svg>
}
