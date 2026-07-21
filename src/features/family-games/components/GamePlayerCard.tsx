import type { ReactNode } from 'react'
import { memberColorStyle } from '../../../utils/memberColor'
import type { FamilyMember } from '../../../hooks/useFamilyMembers'
import { GameRecordBadge } from './GameRecordBadge'

export interface GamePlayerCardProps {
  member: FamilyMember
  selected: boolean
  onSelect: () => void
  figure: ReactNode
  /** Omit entirely (leave undefined) for pickers that aren't about a personal record, e.g. the Hangar's "whose loadout" switcher. */
  recordValue?: string | null
  recordLabel?: string
  noRecordLabel?: string
}

// One selected-state visual (border + soft background + check) for every
// game's player picker, instead of each game inventing its own.
export function GamePlayerCard({ member, selected, onSelect, figure, recordValue, recordLabel, noRecordLabel }: GamePlayerCardProps) {
  return <button
    type="button"
    className={`game-player-card${selected ? ' is-selected' : ''}`}
    style={memberColorStyle(member)}
    aria-pressed={selected}
    onClick={onSelect}
  >
    {figure}
    <span className="game-player-card-info">
      <strong>{member.display_name}</strong>
      {recordLabel && noRecordLabel && <GameRecordBadge label={recordLabel} value={recordValue ?? null} noRecordLabel={noRecordLabel} />}
    </span>
    {selected && <span className="game-player-card-check" aria-hidden="true">✓</span>}
  </button>
}
