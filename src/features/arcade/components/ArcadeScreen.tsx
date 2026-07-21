import { useMemo } from 'react'
import { FamilyMark } from '../../../components/FamilyMark'
import { useFamilyCore } from '../../../context/family/FamilyCoreContext'
import { useFamilyMembersData } from '../../../context/family/FamilyMembersContext'
import { useLanguage } from '../../../i18n/languageContext'
import { useRouterActions } from '../../../router'
import { ARCADE_GAMES } from '../gameRegistry'
import { arcadeCopy } from '../copy'
import { ArcadeGameCard } from './ArcadeGameCard'
import { loadFamilyJumpRecords } from '../../family-jump/storage/records'
import { loadFamilyFleetRecords } from '../../family-fleet/storage/records'
import '../arcade.css'

export function ArcadeScreen() {
  const { navigate } = useRouterActions()
  const { language } = useLanguage()
  const c = arcadeCopy(language)
  const { familyId, currentMember } = useFamilyCore()
  const { members, membersLoading } = useFamilyMembersData()
  const bests = useMemo(() => ({ 'family-jump': loadFamilyJumpRecords(familyId)[currentMember.id] ?? 0, 'family-fleet': loadFamilyFleetRecords(familyId)[currentMember.id] ?? 0 }), [familyId, currentMember.id])
  return <main className="arcade-page" aria-labelledby="arcade-title">
    <header className="page-header arcade-page__header">
      <div>
        <h1 id="arcade-title">{c.title}</h1>
        <p>{c.subtitle}</p>
      </div>
      <FamilyMark variant="dynamic" members={members} loading={membersLoading} size={42} />
    </header>
    <section className="arcade-game-grid" aria-label={c.choose}>
      {ARCADE_GAMES.map((game) => <ArcadeGameCard key={game.key} game={game} language={language} copy={c} bestScore={bests[game.key]} onPlay={() => navigate(game.route)} />)}
    </section>
  </main>
}
