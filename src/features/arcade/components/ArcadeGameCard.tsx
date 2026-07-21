import type { Language } from '../../../i18n/language'
import type { ArcadeGameDefinition } from '../types'

export function ArcadeGameCard({ game, language, copy, bestScore, onPlay }: { game: ArcadeGameDefinition; language: Language; copy: ReturnType<typeof import('../copy').arcadeCopy>; bestScore: number; onPlay: () => void }) {
  return <article className="card arcade-game-card" data-artwork={game.artworkVariant}>
    <div className={`arcade-game-art arcade-game-art--${game.artworkVariant}`} aria-hidden="true">
      {game.artworkVariant === 'jump' ? <JumpPreview /> : <FleetPreview />}
    </div>
    <div className="arcade-game-card__body">
      <h2>{game.title[language]}</h2>
      <p className="arcade-game-card__description">{game.description[language]}</p>
      <p className="arcade-game-card__best"><span>{copy.personalBest}</span><strong>{bestScore > 0 ? bestScore.toLocaleString(language) : copy.noRecord}</strong></p>
    </div>
    <button type="button" className="btn btn-primary arcade-game-card__cta" onClick={onPlay}>{copy.play}</button>
  </article>
}

function JumpPreview() {
  return <>
    <span className="jump-room-shape jump-room-shape--rug" />
    <span className="jump-platform jump-platform--one" />
    <span className="jump-platform jump-platform--two" />
    <span className="jump-platform jump-platform--three" />
    <span className="jump-arc" />
    <span className="jump-figure"><span className="jump-figure__head" /><span className="jump-figure__body" /></span>
    <span className="jump-clutter jump-clutter--book" />
  </>
}

function FleetPreview() {
  return <>
    <span className="fleet-star fleet-star--one" />
    <span className="fleet-star fleet-star--two" />
    <span className="fleet-star fleet-star--three" />
    <span className="fleet-asteroid" />
    <span className="fleet-trail" />
    <span className="fleet-ship" />
  </>
}
