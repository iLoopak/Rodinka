import type { CSSProperties } from 'react'
import type { FamilyMember, MemberRole } from '../hooks/useFamilyMembers'
import { getMemberColorTheme } from '../utils/memberColor'
import {
  createFamilyMarkModel,
  createFamilyMarkSlots,
  createStaticFamilyMarkSlots,
  familyMarkPetalPath,
  familyMarkPetalTransform,
  FAMILY_MARK_VIEW_BOX_SIZE,
  STATIC_FAMILY_MARK_COLORS,
  type FamilyMarkSlot,
} from '../utils/familyMark'

export type FamilyMarkMember = Pick<FamilyMember, 'id' | 'color_key' | 'custom_color'> & { role?: MemberRole }

export type FamilyLogoAnimationMode =
  | 'idle'
  | 'member-focus'
  | 'reconnecting'
  | 'connection-restored'

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
  activeMemberId?: string | null
  animationMode?: FamilyLogoAnimationMode
}

export type FamilyMarkProps = StaticProps | DynamicProps

function Petal({ slot, fill, className }: { slot: FamilyMarkSlot; fill: string; className?: string }) {
  return <path
    className={className}
    d={familyMarkPetalPath(slot)}
    transform={familyMarkPetalTransform(slot)}
    fill={fill}
  />
}

function memberAnimationStyle(mode: FamilyLogoAnimationMode, index: number): CSSProperties | undefined {
  if (mode === 'idle') return { animationDelay: `${index * -480}ms` }
  if (mode === 'reconnecting') return { animationDelay: `${index * 110}ms` }
  if (mode === 'connection-restored') return { animationDelay: `${index * 70}ms` }
  return undefined
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
  const animationMode: FamilyLogoAnimationMode = dynamic ? (props.animationMode ?? 'idle') : 'idle'
  const activeMemberId = dynamic ? props.activeMemberId : null
  const model = createFamilyMarkModel(dynamic && !loading ? props.members : [])
  const classes = [
    'family-mark',
    `family-mark-${props.variant}`,
    dynamic && !loading ? `family-mark-animation-${animationMode}` : '',
    loading ? 'is-loading' : '',
    className ?? '',
  ]
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
    data-animation-mode={dynamic && !loading ? animationMode : undefined}
    {...accessibility}
  >
    {props.variant === 'static' && createStaticFamilyMarkSlots().map((slot, index) => <Petal
      key={STATIC_FAMILY_MARK_COLORS[index]}
      slot={slot}
      fill={STATIC_FAMILY_MARK_COLORS[index]}
      className="family-mark-petal"
    />)}

    {loading && createFamilyMarkSlots(3).map((slot, index) => <Petal
      key={index}
      slot={slot}
      fill="var(--neutral-soft)"
      className="family-mark-petal family-mark-loading-petal"
    />)}

    {dynamic && !loading && model.members.map((member, index) => {
      const active = member.id === activeMemberId
      return <g
        key={member.id}
        className={`family-mark-member${active ? ' is-active-member' : ''}`}
        data-member-id={member.id}
        data-active-member={active ? 'true' : undefined}
        style={memberAnimationStyle(animationMode, index)}
      >
        <Petal
          slot={model.slots[index]}
          fill={getMemberColorTheme(member).primary}
          className="family-mark-petal"
        />
      </g>
    })}
  </svg>
}
