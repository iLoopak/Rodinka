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
  const { navigate } = useRouterActions(); const { language } = useLanguage(); const c = arcadeCopy(language)
  const { familyId, currentMember } = useFamilyCore(); const { members, membersLoading } = useFamilyMembersData()
  const bests = useMemo(() => ({ 'family-jump': loadFamilyJumpRecords(familyId)[currentMember.id] ?? 0, 'family-fleet': loadFamilyFleetRecords(familyId)[currentMember.id] ?? 0 }), [familyId, currentMember.id])
  return <section className="arcade-screen" aria-labelledby="arcade-title"><header className="arcade-header"><button type="button" onClick={() => navigate('/')} className="arcade-back">← {c.back}</button><FamilyMark variant="dynamic" members={members} loading={membersLoading} size={46}/><div><p className="eyebrow">{c.choose}</p><h1 id="arcade-title">{c.title}</h1><p>{c.subtitle}</p></div></header><div className="arcade-grid">{ARCADE_GAMES.map((game) => <ArcadeGameCard key={game.key} game={game} language={language} copy={c} bestScore={bests[game.key]} onPlay={() => navigate(game.route)} />)}</div></section>
}
