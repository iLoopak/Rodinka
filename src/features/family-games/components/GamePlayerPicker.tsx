import type { ReactNode } from 'react'
import type { FamilyMember } from '../../../hooks/useFamilyMembers'
import { GamePlayerCard } from './GamePlayerCard'

export interface GamePlayerPickerProps {
  heading: string
  headingId?: string
  members: FamilyMember[]
  selectedId: string
  onSelect: (memberId: string) => void
  loading?: boolean
  loadingLabel?: string
  renderFigure: (member: FamilyMember) => ReactNode
  recordFor: (member: FamilyMember) => string | null
  recordLabel: string
  noRecordLabel: string
}

// "Vyber hráče" — the same heading + grid of GamePlayerCards for every
// game. Each game only supplies its own figure rendering (cosmetics or
// plain) and how it formats a member's record.
export function GamePlayerPicker({
  heading, headingId, members, selectedId, onSelect, loading, loadingLabel,
  renderFigure, recordFor, recordLabel, noRecordLabel,
}: GamePlayerPickerProps) {
  return <>
    <h2 id={headingId}>{heading}</h2>
    {loading ? <p>{loadingLabel}</p> : <div className="game-player-grid">
      {members.map((member) => <GamePlayerCard
        key={member.id}
        member={member}
        selected={member.id === selectedId}
        onSelect={() => onSelect(member.id)}
        figure={renderFigure(member)}
        recordValue={recordFor(member)}
        recordLabel={recordLabel}
        noRecordLabel={noRecordLabel}
      />)}
    </div>}
  </>
}
