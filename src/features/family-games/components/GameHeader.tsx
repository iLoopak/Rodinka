import type { ReactNode } from 'react'
import { FamilyMark } from '../../../components/FamilyMark'
import type { FamilyMember } from '../../../hooks/useFamilyMembers'

export interface GameHeaderProps {
  backLabel: string
  /** Overrides the button's accessible name when the visible label is terser than what a screen reader should announce. */
  backAccessibleLabel?: string
  onBack: () => void
  members: FamilyMember[]
  membersLoading?: boolean
  /** Right-of-logo slot — an offline/sync badge today, room for more later. */
  rightSlot?: ReactNode
}

// Every Family Games entry screen shares this exact top bar: back on the
// left, the family mark centered, an optional status slot on the right.
export function GameHeader({ backLabel, backAccessibleLabel, onBack, members, membersLoading, rightSlot }: GameHeaderProps) {
  return <header className="game-header">
    <button type="button" className="game-header-back" onClick={onBack} aria-label={backAccessibleLabel}>
      <span aria-hidden="true">←</span> {backLabel}
    </button>
    <FamilyMark variant="dynamic" members={members} loading={membersLoading} size={38} />
    {rightSlot}
  </header>
}
