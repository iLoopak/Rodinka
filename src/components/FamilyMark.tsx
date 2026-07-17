import type { FamilyMember, MemberRole } from '../hooks/useFamilyMembers'
import { getMemberMainColor, memberColorKey } from '../utils/memberColor'
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

export type FamilyMarkMember = Pick<FamilyMember, 'id' | 'color_key'> & { role?: MemberRole }

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
  return <path
    className={className}
    d={familyMarkPetalPath(slot)}
    transform={familyMarkPetalTransform(slot)}
    fill={fill}
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
  const model = createFamilyMarkModel(dynamic && !loading ? props.members : [])
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

    {dynamic && !loading && model.members.map((member, index) => <Petal
      key={member.id}
      slot={model.slots[index]}
      fill={getMemberMainColor(memberColorKey(member))}
      className="family-mark-petal"
    />)}
  </svg>
}
