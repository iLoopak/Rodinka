import type { Language } from '../../../i18n/language'
import type { ArcadeGameDefinition } from '../types'
export function ArcadeGameCard({ game, language, copy, bestScore, onPlay }: { game: ArcadeGameDefinition; language: Language; copy: ReturnType<typeof import('../copy').arcadeCopy>; bestScore: number; onPlay: () => void }) {
  return <article className="arcade-card"><div className={`arcade-art is-${game.artworkVariant}`} aria-hidden="true"><span className="ship"/><span className="orb one"/><span className="orb two"/></div><h2>{game.title[language]}</h2><p>{game.description[language]}</p><p className="arcade-best"><span>{copy.personalBest}</span><strong>{bestScore > 0 ? bestScore.toLocaleString(language) : copy.noRecord}</strong></p><button type="button" onClick={onPlay}>{copy.play}</button></article>
}
