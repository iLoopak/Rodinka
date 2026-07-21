import type { ReactNode } from 'react'

export interface GameHeroProps {
  eyebrow: string
  title: string
  titleId?: string
  description: string
  /** A short one-line control hint, e.g. "Drag sideways or use arrows." */
  helper?: string
  /** Per-game illustration/preview — its own markup and styling stay with the game. */
  preview?: ReactNode
}

// The card chrome, typography and slot order are shared by every Family
// Games entry screen; only `preview` (and its own feature CSS) differs
// per game.
export function GameHero({ eyebrow, title, titleId, description, helper, preview }: GameHeroProps) {
  return <section className="game-hero">
    <p className="eyebrow">{eyebrow}</p>
    <h1 id={titleId}>{title}</h1>
    <p className="game-hero-description">{description}</p>
    {helper && <p className="game-hero-helper">{helper}</p>}
    {preview}
  </section>
}
