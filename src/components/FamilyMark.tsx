import { useId } from 'react'
import type { FamilyMember } from '../hooks/useFamilyMembers'
import { memberColorVar } from '../utils/memberColor'
import { createFamilyMarkModel, type FamilyMarkSlot } from '../utils/familyMark'

interface Props {
  members: Array<Pick<FamilyMember, 'id' | 'color_key'>>
  size?: number
  className?: string
  loading?: boolean
}

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

export function FamilyMark({ members, size = 32, className, loading = false }: Props) {
  const model = createFamilyMarkModel(loading ? [] : members)
  const gradientId = `family-mark-${useId().replace(/:/g, '')}`
  const classes = ['family-mark', loading ? 'is-loading' : '', className ?? ''].filter(Boolean).join(' ')

  return <svg
    className={classes}
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    aria-hidden="true"
    data-member-count={loading ? undefined : members.length}
  >
    {loading ? <>
      <circle className="family-mark-loading-ring" cx="32" cy="32" r="22" />
      <Petal slot={model.slots[0]} fill="var(--neutral-soft)" className="family-mark-loading-petal" />
    </> : <>
      {model.overflowMembers.length > 0 && <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          {model.overflowMembers.map((member, index) => <stop
            key={member.id}
            offset={`${model.overflowMembers.length === 1 ? 0 : index / (model.overflowMembers.length - 1)}`}
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
        <text className="family-mark-overflow-label" x={model.slots[5].cx} y={model.slots[5].cy}>
          +{model.overflowMembers.length}
        </text>
      </>}
    </>}
  </svg>
}
