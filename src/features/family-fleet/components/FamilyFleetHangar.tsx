import { useEffect, useMemo, useRef, useState } from 'react'
import { useFamilyCore } from '../../../context/family/FamilyCoreContext'
import { useFamilyMembersData } from '../../../context/family/FamilyMembersContext'
import { useLanguage } from '../../../i18n/languageContext'
import { useRouterActions } from '../../../router'
import { getMemberColorTheme } from '../../../utils/memberColor'
import { GameHeader, GamePlayerCard, GamePlayerFigure } from '../../family-games'
import '../../family-games/familyGames.css'
import { familyFleetHangarCopyFor, cosmeticCategoryLabel, cosmeticItemName } from '../cosmeticsCopy'
import { achievementCopy } from '../achievementsCopy'
import { FAMILY_FLEET_ACHIEVEMENTS } from '../achievements'
import { COSMETIC_CATEGORIES, cosmeticKey, isDefaultCosmetic, type CosmeticCategory, type FleetLoadout } from '../cosmetics'
import { drawCabin, drawEngineTrail, drawHull, drawWings } from '../game/cosmeticsRendering'
import { equipCosmetic, loadEquippedLoadout, loadUnlockedCosmetics } from '../storage/cosmetics'
import { loadUnlockedAchievements } from '../storage/achievements'
import '../familyFleet.css'

function rewardAchievementFor(category: CosmeticCategory, id: string) {
  return FAMILY_FLEET_ACHIEVEMENTS.find((achievement) => achievement.reward?.category === category && achievement.reward.id === id) ?? null
}

function ShipPreviewCanvas({ loadout, accent, label }: { loadout: FleetLoadout; accent: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = canvas.clientWidth || 200; const h = canvas.clientHeight || 220
    canvas.width = w * dpr; canvas.height = h * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const x = w / 2; const y = h / 2 + 10
    let raf = 0; let start = performance.now()
    const frame = (now: number) => {
      const time = (now - start) / 1000
      ctx.clearRect(0, 0, w, h)
      drawEngineTrail(ctx, loadout.engineTrail, x, y, time, accent)
      drawHull(ctx, loadout.hull, x, y, accent)
      drawWings(ctx, loadout.wings, x, y, accent, time)
      drawCabin(ctx, loadout.cabin, x, y)
      if (!reduced) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [loadout, accent])
  return <canvas ref={ref} className="hangar-preview-canvas" role="img" aria-label={label} />
}

export function FamilyFleetHangar() {
  const { navigate } = useRouterActions()
  const { familyId, currentMember } = useFamilyCore()
  const { members, membersLoading } = useFamilyMembersData()
  const { language } = useLanguage()
  const copy = useMemo(() => familyFleetHangarCopyFor(language), [language])
  const [selected, setSelected] = useState(currentMember.id)
  const [version, setVersion] = useState(0)
  const member = members.find((m) => m.id === selected) ?? members[0] ?? currentMember
  const accent = getMemberColorTheme(member).primary

  // Cheap synchronous localStorage reads — recomputed on every render, and
  // `version` exists purely to force a re-render after `use()` mutates storage.
  void version
  const loadout = loadEquippedLoadout(familyId, member.id)
  const unlocked = loadUnlockedCosmetics(familyId, member.id)
  const unlockedAchievements = loadUnlockedAchievements(familyId, member.id)

  function use(category: CosmeticCategory, id: string) {
    equipCosmetic(familyId, member.id, category, id)
    setVersion((v) => v + 1)
  }

  return <main className="fleet-screen hangar-screen">
    <GameHeader backLabel={copy.backToFleet} onBack={() => navigate('/arcade/family-fleet')} members={members} membersLoading={membersLoading} />

    <div className="fleet-scroll">
      <div className="hangar-layout">
        <section className="card fleet-panel hangar-preview-panel">
          <p className="eyebrow">{copy.choosePilot}</p>
          <h1>{copy.title}</h1>
          <p className="fleet-muted">{copy.subtitle}</p>
          <div className="game-player-grid hangar-member-picker">
            {members.map((m) => <GamePlayerCard
              key={m.id}
              member={m}
              selected={m.id === member.id}
              onSelect={() => setSelected(m.id)}
              figure={<GamePlayerFigure member={m} />}
            />)}
          </div>
          <ShipPreviewCanvas loadout={loadout} accent={accent} label={copy.shipPreview} />
          <p className="hangar-progress" role="status">{copy.achievementsProgress(unlockedAchievements.size, FAMILY_FLEET_ACHIEVEMENTS.length)}</p>
        </section>

        <section className="hangar-categories">
          {COSMETIC_CATEGORIES.map(({ category, ids }) => <div key={category} className="card fleet-panel hangar-category">
            <h2>{cosmeticCategoryLabel(language, category)}</h2>
            <div className="hangar-item-grid">
              {ids.map((id) => {
                const isDefault = isDefaultCosmetic(category, id)
                const isUnlocked = isDefault || unlocked.has(cosmeticKey(category, id))
                const isEquipped = loadout[category] === id
                const achievement = isDefault ? null : rewardAchievementFor(category, id)
                return <div key={id} className={`hangar-item${isEquipped ? ' is-equipped' : ''}${isUnlocked ? '' : ' is-locked'}`}>
                  <span className="hangar-item-name">{cosmeticItemName(language, id)}</span>
                  {isUnlocked ? (
                    isEquipped ? <span className="badge badge-done">{copy.equipped}</span>
                      : <button type="button" className="btn btn-secondary" onClick={() => use(category, id)}>{copy.use}</button>
                  ) : <>
                    <span className="badge badge-neutral">{copy.locked}</span>
                    {achievement && <small className="hangar-lock-hint">{copy.unlockHint(achievementCopy(language, achievement.id).title)}</small>}
                  </>}
                </div>
              })}
            </div>
          </div>)}
        </section>
      </div>
    </div>
  </main>
}
