import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { FamilyMark } from '../../../components/FamilyMark'
import { useFamilyMembersData } from '../../../context/family/FamilyMembersContext'
import { useFamilyCore } from '../../../context/family/FamilyCoreContext'
import type { FamilyMember } from '../../../hooks/useFamilyMembers'
import { useLanguage } from '../../../i18n/languageContext'
import { useRouter } from '../../../router'
import { getMemberColorTheme, memberColorStyle } from '../../../utils/memberColor'
import { familyJumpCopy, type FamilyJumpCopy } from '../copy'
import { FamilyJumpEngine } from '../game/FamilyJumpEngine'
import { useFamilyJumpRecords, type FamilyJumpSyncStatus } from '../hooks/useFamilyJumpRecords'
import { sortFamilyJumpLeaderboard, type FamilyJumpRecordMap } from '../storage/records'
import { recordFamilyJumpRun, type FamilyJumpMemberRunStats } from '../storage/runStats'
import type { JumpDebugSnapshot, JumpScoreMarker } from '../types/game'
import '../familyJump.css'

type ScreenPhase = 'intro' | 'playing' | 'game-over'

interface CompletedRun {
  score: number
  newPersonalBest: boolean
  overtakenNames: string[]
  stats: FamilyJumpMemberRunStats
}

export function FamilyJumpScreen() {
  const { navigate } = useRouter()
  const { familyId, currentMember } = useFamilyCore()
  const { members, membersLoading } = useFamilyMembersData()
  const { language } = useLanguage()
  const copy = useMemo(() => familyJumpCopy(language), [language])
  const [selectedMemberId, setSelectedMemberId] = useState(currentMember.id)
  const [phase, setPhase] = useState<ScreenPhase>('intro')
  const [completedRun, setCompletedRun] = useState<CompletedRun | null>(null)
  const [runKey, setRunKey] = useState(0)
  const memberIds = useMemo(() => members.map((member) => member.id), [members])
  const { records, saveBestScore, syncStatus } = useFamilyJumpRecords(familyId, memberIds, phase !== 'playing')
  const selectedMember = members.find((member) => member.id === selectedMemberId) ?? members[0] ?? currentMember

  useEffect(() => {
    if (members.length > 0 && !members.some((member) => member.id === selectedMemberId)) {
      setSelectedMemberId(members[0].id)
    }
  }, [members, selectedMemberId])

  const exitGame = useCallback(() => navigate('/'), [navigate])

  const startRun = useCallback(() => {
    setCompletedRun(null)
    setRunKey((value) => value + 1)
    setPhase('playing')
  }, [])

  const finishRun = useCallback((score: number) => {
    const previousBest = records[selectedMember.id] ?? 0
    const overtakenNames = members
      .filter((member) => member.id !== selectedMember.id && (records[member.id] ?? 0) > 0 && score > records[member.id])
      .map((member) => member.display_name)
    saveBestScore(selectedMember.id, score)
    const nextRunStats = recordFamilyJumpRun(familyId, selectedMember.id, score)
    setCompletedRun({
      score,
      newPersonalBest: score > previousBest,
      overtakenNames,
      stats: nextRunStats[selectedMember.id],
    })
    setPhase('game-over')
  }, [familyId, members, records, saveBestScore, selectedMember])

  if (phase === 'playing') {
    return <FamilyJumpGame
      key={runKey}
      member={selectedMember}
      members={members}
      records={records}
      copy={copy}
      onExit={exitGame}
      onGameOver={finishRun}
    />
  }

  const leaderboard = sortFamilyJumpLeaderboard(members, records)
  return <section className="family-jump-screen family-jump-menu-screen" aria-labelledby="family-jump-title">
    <header className="family-jump-menu-header">
      <button type="button" className="family-jump-back" onClick={exitGame} aria-label={copy.backToApp}>
        <span aria-hidden="true">←</span> {copy.back}
      </button>
      <FamilyMark variant="dynamic" members={members} size={38} loading={membersLoading} />
    </header>

    <div className="family-jump-menu-scroll">
      <SyncStatus copy={copy} status={syncStatus} />
      {phase === 'intro' ? <>
        <div className="family-jump-hero">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1 id="family-jump-title">{copy.title}</h1>
          <p>{copy.intro}</p>
          <div className="family-jump-hero-figures" aria-hidden="true">
            {members.slice(0, 5).map((member, index) => <JumpMemberFigure key={member.id} member={member} style={{ '--jump-index': index } as CSSProperties} />)}
          </div>
        </div>

        <section className="family-jump-card" aria-labelledby="family-jump-player-heading">
          <h2 id="family-jump-player-heading">{copy.choosePlayer}</h2>
          {membersLoading ? <p>{copy.loadingMembers}</p> : <div className="family-jump-member-grid">
            {members.map((member) => {
              const selected = member.id === selectedMember.id
              return <button
                key={member.id}
                type="button"
                className={`family-jump-member-choice${selected ? ' is-selected' : ''}`}
                style={memberColorStyle(member)}
                aria-pressed={selected}
                onClick={() => setSelectedMemberId(member.id)}
              >
                <JumpMemberFigure member={member} />
                <span>
                  <strong>{member.display_name}</strong>
                  <small>{copy.personalBest}: {records[member.id] ? copy.score(records[member.id]) : copy.noRecord}</small>
                </span>
              </button>
            })}
          </div>}
          <button type="button" className="family-jump-primary-action" disabled={membersLoading || members.length === 0} onClick={startRun}>
            {copy.play}
          </button>
        </section>

        <section className="family-jump-card family-jump-how-to" aria-labelledby="family-jump-controls-heading">
          <h2 id="family-jump-controls-heading">{copy.controls}</h2>
          <div><span aria-hidden="true">↙</span><p>{copy.touchHelp}</p></div>
          <div><span aria-hidden="true">⌨</span><p>{copy.keyboardHelp}</p></div>
          <div><span aria-hidden="true">●</span><p>{copy.clutterHelp}</p></div>
        </section>
      </> : completedRun && <GameOverPanel
        copy={copy}
        member={selectedMember}
        result={completedRun}
        leaderboard={leaderboard}
        onRestart={startRun}
        onChangePlayer={() => setPhase('intro')}
        onExit={exitGame}
      />}

      <Leaderboard copy={copy} entries={leaderboard} />
    </div>
  </section>
}

function SyncStatus({ copy, status }: { copy: FamilyJumpCopy; status: FamilyJumpSyncStatus }) {
  if (status === 'idle') return null
  const label = status === 'syncing'
    ? copy.syncing
    : status === 'synced'
      ? copy.synced
      : status === 'offline'
        ? copy.syncOffline
        : copy.syncError
  return <p className={`family-jump-sync-status is-${status}`} role="status">
    <span aria-hidden="true" />{label}
  </p>
}

interface FamilyJumpGameProps {
  member: FamilyMember
  members: FamilyMember[]
  records: FamilyJumpRecordMap
  copy: FamilyJumpCopy
  onExit: () => void
  onGameOver: (score: number) => void
}

function FamilyJumpGame({ member, members, records, copy, onExit, onGameOver }: FamilyJumpGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<FamilyJumpEngine | null>(null)
  const leftPointers = useRef(new Set<number>())
  const rightPointers = useRef(new Set<number>())
  const [score, setScore] = useState(0)
  const [paused, setPaused] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [debug, setDebug] = useState(false)
  const [debugSnapshot, setDebugSnapshot] = useState<JumpDebugSnapshot>({
    fps: 0,
    velocityY: 0,
    score: 0,
    platformCount: 0,
    clutterCount: 0,
    environment: 'playroom',
  })
  const colorTheme = useMemo(() => getMemberColorTheme(member), [member])
  const markers = useMemo<JumpScoreMarker[]>(() => members
    .filter((candidate) => candidate.id !== member.id && (records[candidate.id] ?? 0) > 0)
    .map((candidate) => {
      const theme = getMemberColorTheme(candidate)
      return {
        memberId: candidate.id,
        name: candidate.display_name,
        score: records[candidate.id],
        color: theme.primary,
        foreground: theme.foreground,
      }
    }), [member.id, members, records])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const engine = new FamilyJumpEngine({
      canvas,
      color: colorTheme.primary,
      markers,
      copy,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      familyRecord: Math.max(0, ...Object.values(records)),
      onScore: setScore,
      onPauseChange: setPaused,
      onAnnouncement: setAnnouncement,
      onDebug: setDebugSnapshot,
      onGameOver,
    })
    engineRef.current = engine
    engine.start()
    return () => {
      engine.destroy()
      engineRef.current = null
    }
  }, [colorTheme.primary, copy, markers, onGameOver, records])

  const clearPointers = useCallback(() => {
    leftPointers.current.clear()
    rightPointers.current.clear()
    engineRef.current?.setControl('left', false)
    engineRef.current?.setControl('right', false)
  }, [])

  useEffect(() => {
    const releaseOnVisibilityChange = () => {
      if (document.hidden) clearPointers()
    }
    window.addEventListener('blur', clearPointers)
    document.addEventListener('visibilitychange', releaseOnVisibilityChange)
    return () => {
      window.removeEventListener('blur', clearPointers)
      document.removeEventListener('visibilitychange', releaseOnVisibilityChange)
      clearPointers()
    }
  }, [clearPointers])

  function press(side: 'left' | 'right', event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    if (paused) return
    const pointers = side === 'left' ? leftPointers.current : rightPointers.current
    pointers.add(event.pointerId)
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Capture can fail if the pointer already ended. */ }
    engineRef.current?.setControl(side, true)
  }

  function release(side: 'left' | 'right', event: ReactPointerEvent<HTMLButtonElement>) {
    const pointers = side === 'left' ? leftPointers.current : rightPointers.current
    pointers.delete(event.pointerId)
    if (pointers.size === 0) engineRef.current?.setControl(side, false)
  }

  const togglePause = () => {
    clearPointers()
    engineRef.current?.togglePause()
  }

  return <section
    className="family-jump-screen family-jump-playing"
    aria-label={copy.title}
    onContextMenu={(event) => event.preventDefault()}
    onDragStart={(event) => event.preventDefault()}
  >
    <canvas ref={canvasRef} className="family-jump-canvas" role="img" aria-label={copy.canvasLabel} />
    <div className="family-jump-hud-shield" aria-hidden="true" />
    <header className="family-jump-game-toolbar">
      <button type="button" className="family-jump-toolbar-button" onClick={onExit} aria-label={copy.backToApp}>←</button>
      <div className="family-jump-score" aria-label={`${copy.scoreLabel}: ${copy.score(score)}`}>
        <small>{copy.scoreLabel}</small><strong>{copy.score(score)}</strong>
      </div>
      <button type="button" className="family-jump-toolbar-button" onClick={togglePause} aria-label={paused ? copy.resume : copy.pause}>
        <span aria-hidden="true">{paused ? '▶' : 'Ⅱ'}</span>
      </button>
    </header>

    <div className="family-jump-touch-controls" aria-label={copy.controls}>
      <button
        type="button"
        className="family-jump-touch-zone is-left"
        aria-label={copy.moveLeft}
        onPointerDown={(event) => press('left', event)}
        onPointerUp={(event) => release('left', event)}
        onPointerCancel={(event) => release('left', event)}
        onLostPointerCapture={(event) => release('left', event)}
        onPointerLeave={(event) => release('left', event)}
      ><span aria-hidden="true">‹</span></button>
      <button
        type="button"
        className="family-jump-touch-zone is-right"
        aria-label={copy.moveRight}
        onPointerDown={(event) => press('right', event)}
        onPointerUp={(event) => release('right', event)}
        onPointerCancel={(event) => release('right', event)}
        onLostPointerCapture={(event) => release('right', event)}
        onPointerLeave={(event) => release('right', event)}
      ><span aria-hidden="true">›</span></button>
    </div>

    {paused && <div className="family-jump-pause-card" role="status">
      <strong>{copy.paused}</strong>
      <button type="button" onClick={togglePause}>{copy.resume}</button>
    </div>}

    {import.meta.env.DEV && <div className="family-jump-debug-controls">
      <button type="button" onClick={() => {
        const next = !debug
        setDebug(next)
        engineRef.current?.setDebug(next)
      }}>{copy.debug}</button>
      {debug && <>
        <output>{debugSnapshot.fps} FPS · vy {debugSnapshot.velocityY} · {debugSnapshot.score} m · {debugSnapshot.platformCount} pl. · {debugSnapshot.clutterCount} obj. · {debugSnapshot.environment}</output>
        <button type="button" onClick={() => engineRef.current?.finishNow()}>{copy.endRun}</button>
      </>}
    </div>}
    <p className="visually-hidden" aria-live="polite">{paused ? copy.paused : `${copy.scoreLabel}: ${copy.score(score)}`}</p>
    <p className="visually-hidden" aria-live="assertive">{announcement}</p>
  </section>
}

function JumpMemberFigure({ member, style }: { member: FamilyMember; style?: CSSProperties }) {
  return <span className="family-jump-member-figure" style={{ ...memberColorStyle(member), ...style }} aria-hidden="true">
    <i className="family-jump-eye is-left" /><i className="family-jump-eye is-right" /><i className="family-jump-smile" />
  </span>
}

function Leaderboard({ copy, entries }: { copy: FamilyJumpCopy; entries: ReturnType<typeof sortFamilyJumpLeaderboard> }) {
  return <section className="family-jump-card family-jump-leaderboard" aria-labelledby="family-jump-leaderboard-heading">
    <h2 id="family-jump-leaderboard-heading">{copy.leaderboard}</h2>
    <ol>
      {entries.map((entry) => <li key={entry.member.id} style={memberColorStyle(entry.member)}>
        <span className="family-jump-rank">{entry.rank}</span>
        <span className="family-jump-leader-dot" aria-hidden="true" />
        <strong>{entry.member.display_name}</strong>
        <span>{entry.score ? copy.score(entry.score) : '—'}</span>
      </li>)}
    </ol>
  </section>
}

function GameOverPanel({ copy, member, result, leaderboard, onRestart, onChangePlayer, onExit }: {
  copy: FamilyJumpCopy
  member: FamilyMember
  result: CompletedRun
  leaderboard: ReturnType<typeof sortFamilyJumpLeaderboard>
  onRestart: () => void
  onChangePlayer: () => void
  onExit: () => void
}) {
  const position = leaderboard.find((entry) => entry.member.id === member.id)?.rank ?? 1
  return <div className="family-jump-game-over">
    <div className="family-jump-result-figure"><JumpMemberFigure member={member} /></div>
    <p className="eyebrow">{copy.gameOver}</p>
    <h1 id="family-jump-title">{copy.score(result.score)}</h1>
    <p>{copy.reached} · #{position}</p>
    {result.newPersonalBest && <p className="family-jump-record-celebration" role="status">{copy.newPersonal}</p>}
    <div className="family-jump-run-stats" aria-label={copy.localStats}>
      <span><small>{copy.lastResult}</small><strong>{copy.score(result.stats.lastScore)}</strong></span>
      <span><small>{copy.todayBest}</small><strong>{copy.score(result.stats.todayBest)}</strong></span>
      <span><small>{copy.attempts}</small><strong>{result.stats.attempts}</strong></span>
    </div>
    <section className="family-jump-card family-jump-overtaken">
      <h2>{copy.overtaken}</h2>
      {result.overtakenNames.length > 0
        ? <p>{result.overtakenNames.join(' · ')}</p>
        : <p>{copy.noOvertaken}</p>}
    </section>
    <div className="family-jump-result-actions">
      <button type="button" className="family-jump-primary-action" onClick={onRestart}>{copy.playAgain}</button>
      <button type="button" className="btn-secondary" onClick={onChangePlayer}>{copy.changePlayer}</button>
      <button type="button" className="btn-link" onClick={onExit}>{copy.backToApp}</button>
    </div>
  </div>
}
