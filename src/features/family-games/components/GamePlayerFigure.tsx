import type { CSSProperties, ReactNode } from 'react'
import { memberColorStyle } from '../../../utils/memberColor'
import type { FamilyMember } from '../../../hooks/useFamilyMembers'

export interface GamePlayerFigureProps {
  member: Pick<FamilyMember, 'id' | 'color_key' | 'custom_color'>
  /** Per-game cosmetic overlays (e.g. Family Jump's hat/glasses), rendered on top of the base figure. */
  children?: ReactNode
  style?: CSSProperties
  className?: string
}

// The one drawn avatar every Family Games screen uses: a colored figure
// with eyes and a smile, recognizable at a glance and personal in a way a
// plain initial never is. Game-specific cosmetics are layered on as children.
export function GamePlayerFigure({ member, children, style, className }: GamePlayerFigureProps) {
  return <span className={`game-player-figure${className ? ` ${className}` : ''}`} style={{ ...memberColorStyle(member), ...style }} aria-hidden="true">
    <i className="game-player-eye is-left" /><i className="game-player-eye is-right" /><i className="game-player-smile" />
    {children}
  </span>
}
