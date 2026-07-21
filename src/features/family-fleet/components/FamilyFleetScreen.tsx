import { useCallback, useMemo, useState } from 'react'
import { FamilyMark } from '../../../components/FamilyMark'
import { useFamilyCore } from '../../../context/family/FamilyCoreContext'
import { useFamilyMembersData } from '../../../context/family/FamilyMembersContext'
import { useLanguage } from '../../../i18n/languageContext'
import { useRouterActions } from '../../../router'
import { memberColorStyle } from '../../../utils/memberColor'
import { familyFleetCopy } from '../copy'
import { achievementCopy } from '../achievementsCopy'
import type { AchievementDefinition } from '../achievements'
import type { FamilyFleetPhase, FamilyFleetRunResult } from '../types'
import { useFamilyFleetRecords } from '../hooks/useFamilyFleetRecords'
import { recordFamilyFleetRun } from '../storage/runStats'
import { sortFamilyFleetLeaderboard } from '../storage/records'
import { evaluateFamilyFleetAchievements } from '../storage/achievements'
import { loadEquippedLoadout } from '../storage/cosmetics'
import { FamilyFleetGame } from './FamilyFleetGame'
import '../familyFleet.css'

const runId = () => crypto?.randomUUID?.() ?? `fleet-${Date.now()}-${Math.random()}`

export function FamilyFleetScreen() {
  const { navigate } = useRouterActions()
  const { familyId, currentMember } = useFamilyCore()
  const { members, membersLoading } = useFamilyMembersData()
  const { language } = useLanguage()
  const copy = useMemo(() => familyFleetCopy(language), [language])
  const [selected, setSelected] = useState(currentMember.id)
  const [phase, setPhase] = useState<FamilyFleetPhase>('intro')
  const [key, setKey] = useState(0)
  const [rid, setRid] = useState('')
  const [result, setResult] = useState<(FamilyFleetRunResult & { newBest: boolean; overtaken: string[] }) | null>(null)
  const [newAchievements, setNewAchievements] = useState<AchievementDefinition[]>([])
  const ids = useMemo(() => members.map((m) => m.id), [members])
  const { records, saveBestScore, syncStatus } = useFamilyFleetRecords(familyId, ids, phase !== 'playing')
  const member = members.find((m) => m.id === selected) ?? members[0] ?? currentMember
  // Cheap synchronous localStorage read — recomputed on every render so a
  // trip to the Hangar and back always reflects the currently equipped gear.
  const loadout = loadEquippedLoadout(familyId, member.id)

  const start = useCallback(() => {
    setRid(runId())
    setResult(null)
    setNewAchievements([])
    setKey((k) => k + 1)
    setPhase('playing')
  }, [])

  const finish = useCallback((r: FamilyFleetRunResult) => {
    const prev = records[member.id] ?? 0
    const overtaken = members.filter((m) => m.id !== member.id && (records[m.id] ?? 0) > 0 && r.score > records[m.id]).map((m) => m.display_name)
    const nextRecords = saveBestScore(member.id, r.score)
    const { stats, counted } = recordFamilyFleetRun(familyId, member.id, rid || runId(), r)
    if (counted) {
      const unlocked = evaluateFamilyFleetAchievements({
        familyId, memberId: member.id, runResult: r,
        memberStats: stats[member.id], familyStats: stats, familyRecords: nextRecords,
      })
      setNewAchievements(unlocked)
    }
    setResult({ ...r, newBest: r.score > prev, overtaken })
    setPhase('game-over')
  }, [familyId, member, members, records, saveBestScore, rid])

  if (phase === 'playing') return <FamilyFleetGame
    key={key} member={member} loadout={loadout} copy={copy}
    onGameOver={finish} onPause={() => setPhase('paused')} onExit={() => setPhase('game-over')}
  />

  const leaderboard = sortFamilyFleetLeaderboard(members, records)

  return <main className="fleet-screen">
    <header className="fleet-menu-header">
      <button type="button" className="btn btn-secondary" onClick={() => navigate('/arcade')}>← {copy.backArcade}</button>
      <button type="button" className="btn btn-secondary" onClick={() => navigate('/arcade/family-fleet/hangar')}>{copy.hangar}</button>
      <FamilyMark variant="dynamic" members={members} loading={membersLoading} size={38} />
      <span className={`status-pill fleet-sync is-${syncStatus}`}>
        {copy[syncStatus === 'syncing' ? 'syncing' : syncStatus === 'synced' ? 'synced' : syncStatus === 'offline' ? 'offline' : syncStatus === 'error' ? 'error' : 'synced']}
      </span>
    </header>

    {phase === 'paused' ? (
      <div className="card fleet-panel">
        <h1>{copy.paused}</h1>
        <div className="fleet-actions">
          <button className="btn btn-primary" onClick={() => setPhase('playing')}>{copy.resume}</button>
          <button className="btn btn-secondary" onClick={start}>{copy.restart}</button>
          <button className="btn btn-link" onClick={() => navigate('/arcade')}>{copy.backArcade}</button>
        </div>
      </div>
    ) : phase === 'game-over' && result ? (
      <div className="card fleet-panel">
        <h1>{copy.gameOver}</h1>
        <p className="fleet-score">{result.score.toLocaleString(language)}</p>
        {result.newBest && <p>{copy.newBest}</p>}
        {result.overtaken.length > 0 && <p>{copy.overtaken}: {result.overtaken.join(', ')}</p>}
        <div className="fleet-stats">
          <span>{copy.time}: {Math.round(result.survivedMs / 1000)} s</span>
          <span>{copy.stars}: {result.stars}</span>
          <span>{copy.targets}: {result.targetsDestroyed}</span>
          <span>{copy.level}: {result.highestLevel}</span>
        </div>
        {newAchievements.length > 0 && <section className="fleet-achievements-unlocked" role="status">
          <h2>{copy.newAchievements}</h2>
          <ul>
            {newAchievements.map((achievement) => {
              const text = achievementCopy(language, achievement.id)
              return <li key={achievement.id}>
                <strong>{text.title}</strong>
                <span>{text.description}</span>
                {achievement.reward && <em>{copy.rewardUnlocked}</em>}
              </li>
            })}
          </ul>
        </section>}
        <div className="fleet-actions">
          <button className="btn btn-primary" onClick={start}>{copy.play}</button>
          <button className="btn btn-secondary" onClick={() => setPhase('intro')}>{copy.changePlayer}</button>
          <button className="btn btn-link" onClick={() => navigate('/arcade')}>{copy.backArcade}</button>
        </div>
        <Leaderboard copy={copy} rows={leaderboard} />
      </div>
    ) : (
      <div className="fleet-intro-layout">
        <section className="card fleet-panel fleet-intro">
          <p className="eyebrow">{copy.choose}</p>
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
          <p className="fleet-muted">{copy.controls}</p>
          <div className="fleet-preview" aria-hidden="true">
            <span className="fleet-preview__trail" />
            <span className="fleet-preview__ship" style={memberColorStyle(member)} />
            <span className="fleet-preview__asteroid" />
          </div>
        </section>
        <aside className="card fleet-panel fleet-side">
          <h2>{copy.choose}</h2>
          <div className="fleet-members">
            {members.map((m) => {
              const active = m.id === member.id
              return <button key={m.id} type="button" style={memberColorStyle(m)} className={`fleet-member-card${active ? ' is-selected' : ''}`} aria-pressed={active} onClick={() => setSelected(m.id)}>
                <span className="fleet-member-avatar" aria-hidden="true">{m.display_name.slice(0, 1)}</span>
                <span><strong>{m.display_name}</strong><small>{records[m.id] ? `${copy.best}: ${records[m.id]}` : copy.noRecord}</small></span>
                {active && <span className="fleet-member-check" aria-hidden="true">✓</span>}
              </button>
            })}
          </div>
          <button className="btn btn-primary fleet-play-cta" disabled={membersLoading || !members.length} onClick={start}>{copy.play}</button>
          <Leaderboard copy={copy} rows={leaderboard} />
        </aside>
      </div>
    )}
  </main>
}

function Leaderboard({ copy, rows }: { copy: ReturnType<typeof familyFleetCopy>; rows: ReturnType<typeof sortFamilyFleetLeaderboard> }) {
  const hasRecord = rows.some((r) => r.score > 0)
  return <section className="fleet-leaderboard">
    <h2>{copy.leaderboard}</h2>
    {hasRecord ? (
      <ol>
        {rows.map((r, index) => <li key={r.member.id} className={index === 0 ? 'is-first' : ''}>
          <span className="fleet-rank">{index + 1}.</span>
          <span className="fleet-member-avatar" style={memberColorStyle(r.member)} aria-hidden="true">{r.member.display_name.slice(0, 1)}</span>
          <span>{r.member.display_name}</span>
          <strong>{r.score > 0 ? r.score : copy.noRecord}</strong>
        </li>)}
      </ol>
    ) : <p className="fleet-empty">Zatím tu není žádný rekord.<br />Buď první, kdo flotilu vyšle do vesmíru.</p>}
  </section>
}
