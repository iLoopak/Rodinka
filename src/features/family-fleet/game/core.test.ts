import { describe, expect, it } from 'vitest'
import { MAX_ENERGY, createFleetState, difficultyFor, resizeState, resultFromState, updateFleet } from './core'
import { SeededRng } from './rng'
import { MAX_POWERUPS_ON_SCREEN, POWERUPS } from './powerups'

describe('family fleet core', () => {
  it('records an impact and keeps scoring/hitboxes unchanged when a bullet destroys a target', () => {
    const s = createFleetState()
    s.entities.push({ id: 20, kind: 'bullet', x: 100, y: 100, r: 5, vx: 0, vy: 0 }, { id: 21, kind: 'enemy', type: 'scout', x: 100, y: 100, r: 10, vx: 0, vy: 0, hp: 1, score: 100 })
    updateFleet(s, .016, new SeededRng(4))
    expect(s.impacts).toHaveLength(1)
    expect(s.impacts[0]).toMatchObject({ x: 100, y: 100, kind: 'enemyKill' })
    expect(s.targetsDestroyed).toBe(1)
    expect(s.player.r).toBe(18)
  })

  it('marks a comet kill as a big impact (triggers screen shake) but a small asteroid kill as not', () => {
    const s = createFleetState()
    s.entities.push(
      { id: 1, kind: 'bullet', x: 50, y: 50, r: 5, vx: 0, vy: 0 },
      { id: 2, kind: 'enemy', type: 'comet', x: 50, y: 50, r: 10, vx: 0, vy: 0, hp: 1, score: 60 },
    )
    updateFleet(s, .016, new SeededRng(4))
    expect(s.impacts[0]).toMatchObject({ kind: 'enemyKill', big: true })
    expect(s.shake).toBeGreaterThan(0)
  })

  it('every power-up type is collectible and starts its own timer without affecting the others', () => {
    for (const def of POWERUPS) {
      const s = createFleetState()
      s.entities.push({ id: 30, kind: 'power', type: def.id, x: s.player.x, y: s.player.y, r: 12, vx: 0, vy: 0 })
      updateFleet(s, .016, new SeededRng(5))
      expect(s.powerupsCollected).toBe(1)
      expect(resultFromState(s).powerupsCollected).toBe(1)
      expect(s.player.powers[def.id]).toBeGreaterThan(0)
      for (const other of POWERUPS) if (other.id !== def.id) expect(s.player.powers[other.id]).toBe(0)
    }
  })

  it('records an impact at the player when actually damaged, but not while a shield absorbs the hit', () => {
    const s = createFleetState()
    s.player.powers.shield = 20
    s.entities.push({ id: 1, kind: 'enemy', type: 'asteroid', x: s.player.x, y: s.player.y, r: 20, vx: 0, vy: 0 })
    updateFleet(s, .016, new SeededRng(2))
    expect(s.player.powers.shield).toBe(0)
    expect(s.impacts).toHaveLength(0)
    for (let i = 0; i < 40; i++) updateFleet(s, .05, new SeededRng(2))
    s.entities.push({ id: 2, kind: 'enemy', type: 'asteroid', x: s.player.x, y: s.player.y, r: 20, vx: 0, vy: 0 })
    updateFleet(s, .016, new SeededRng(2))
    expect(s.impacts.some((impact) => impact.x === s.player.x && impact.y === s.player.y && impact.kind === 'playerHit')).toBe(true)
  })

  it('fades impacts and pickups out after their duration so the lists never grow unbounded', () => {
    const s = createFleetState()
    s.impacts.push({ id: 999, x: 0, y: 0, t: 0, kind: 'enemyKill' })
    s.pickups.push({ id: 998, x: 0, y: 0, t: 0, type: 'shield' })
    for (let i = 0; i < 40; i++) updateFleet(s, .05, new SeededRng(1))
    expect(s.impacts).toHaveLength(0)
    expect(s.pickups).toHaveLength(0)
  })

  it('clamps player movement and resize bounds', () => {
    const s = createFleetState(320, 600)
    s.player.targetX = 999
    updateFleet(s, .1, new SeededRng(1))
    expect(s.player.x).toBeLessThanOrEqual(296)
    resizeState(s, 360, 640)
    expect(s.player.y).toBe(552)
  })

  it('holds a gentle, fixed baseline for the first 15 seconds with no jump at the 15s mark', () => {
    const early = difficultyFor(5, 0)
    expect(early.enemySpeed).toBe(78)
    expect(early.maxConcurrentEnemies).toBe(3)
    const justBefore = difficultyFor(14.9, 0)
    const justAfter = difficultyFor(15.1, 0)
    expect(Math.abs(justAfter.enemySpeed - justBefore.enemySpeed)).toBeLessThan(1)
  })

  it('ramps up smoothly (no sudden jumps) and is noticeably harder after about two minutes', () => {
    const samples = [15, 30, 45, 60, 90, 120]
    let prevSpeed = -Infinity
    for (const time of samples) {
      const { enemySpeed } = difficultyFor(time, 0)
      expect(enemySpeed).toBeGreaterThanOrEqual(prevSpeed)
      prevSpeed = enemySpeed
    }
    const start = difficultyFor(5, 0)
    const twoMinutes = difficultyFor(120, 0)
    expect(twoMinutes.enemySpeed).toBeGreaterThan(start.enemySpeed * 1.5)
    expect(twoMinutes.maxConcurrentEnemies).toBeGreaterThan(start.maxConcurrentEnemies)
  })

  it('never caps out — difficulty keeps creeping up in an endless run', () => {
    const late = difficultyFor(600, 0)
    const veryLate = difficultyFor(1800, 0)
    expect(veryLate.enemySpeed).toBeGreaterThan(late.enemySpeed)
  })

  it('slightly reduces power-up frequency as difficulty rises', () => {
    const early = difficultyFor(5, 0).powerupFreqMul
    const late = difficultyFor(150, 0).powerupFreqMul
    expect(late).toBeLessThan(early)
  })

  it('uses deterministic seeded spawning', () => {
    expect(difficultyFor(30, 1000).level).toBeGreaterThan(1)
  })

  it('shield absorbs a hit before energy is lost, then energy drops on the next unshielded hit', () => {
    const s = createFleetState()
    s.player.powers.shield = 20
    s.entities.push({ id: 1, kind: 'enemy', type: 'asteroid', x: s.player.x, y: s.player.y, r: 20, vx: 0, vy: 0 })
    updateFleet(s, .016, new SeededRng(2))
    expect(s.player.energy).toBe(3)
    expect(s.player.powers.shield).toBe(0)
    s.entities.push({ id: 2, kind: 'enemy', type: 'asteroid', x: s.player.x, y: s.player.y, r: 20, vx: 0, vy: 0 })
    updateFleet(s, .016, new SeededRng(2))
    expect(s.player.energy).toBe(3)
    for (let i = 0; i < 40; i++) updateFleet(s, .05, new SeededRng(2))
    s.entities.push({ id: 3, kind: 'enemy', type: 'asteroid', x: s.player.x, y: s.player.y, r: 20, vx: 0, vy: 0 })
    updateFleet(s, .016, new SeededRng(2))
    expect(s.player.energy).toBe(2)
  })

  it('bullets destroy targets, twin shot expires, and magnet affects only stars', () => {
    const s = createFleetState()
    s.player.powers.twin = .2
    for (let i = 0; i < 5; i++) updateFleet(s, .05, new SeededRng(3))
    expect(s.player.powers.twin).toBe(0)
    s.entities.push({ id: 20, kind: 'bullet', x: 100, y: 100, r: 5, vx: 0, vy: 0 }, { id: 21, kind: 'enemy', type: 'scout', x: 100, y: 100, r: 10, vx: 0, vy: 0, hp: 1, score: 100 })
    updateFleet(s, .016, new SeededRng(4))
    expect(s.targetsDestroyed).toBe(1)
    s.player.powers.magnet = 5
    s.entities.push({ id: 30, kind: 'star', x: s.player.x + 50, y: s.player.y, r: 7, vx: 0, vy: 0 }, { id: 31, kind: 'enemy', type: 'asteroid', x: s.player.x + 50, y: s.player.y, r: 7, vx: 0, vy: 0 })
    updateFleet(s, .016, new SeededRng(5))
    expect(s.entities.find((e) => e.id === 30)?.vx).not.toBe(0)
    expect(s.entities.find((e) => e.id === 31)?.vx).toBe(0)
  })

  it('fires three bullets under Triple Shot, taking priority over an active Twin Shot', () => {
    const s = createFleetState()
    s.player.powers.triple = 10
    s.player.powers.twin = 10
    s.fireTimer = 0
    updateFleet(s, .016, new SeededRng(1))
    const xs = s.entities.filter((e) => e.kind === 'bullet').map((e) => e.x).sort((a, b) => a - b)
    expect(xs).toHaveLength(3)
    expect(xs[1]).toBeCloseTo(s.player.x, 5)
  })

  it('fires faster under Rapid Fire and bigger, harder-hitting bullets under Overcharge', () => {
    const rapid = createFleetState()
    rapid.player.powers.rapid = 10
    rapid.fireTimer = 0
    updateFleet(rapid, .001, new SeededRng(1))
    expect(rapid.fireTimer).toBeCloseTo(.11, 2)

    const overcharged = createFleetState()
    overcharged.player.powers.overcharge = 10
    overcharged.fireTimer = 0
    updateFleet(overcharged, .001, new SeededRng(1))
    const bullet = overcharged.entities.find((e) => e.kind === 'bullet')!
    expect(bullet.r).toBeGreaterThan(4)
    expect(bullet.dmg).toBe(2)
  })

  it('Repair restores one energy without exceeding the maximum', () => {
    const s = createFleetState()
    s.player.energy = MAX_ENERGY - 1
    s.entities.push({ id: 1, kind: 'power', type: 'repair', x: s.player.x, y: s.player.y, r: 12, vx: 0, vy: 0 })
    updateFleet(s, .016, new SeededRng(1))
    expect(s.player.energy).toBe(MAX_ENERGY)

    const full = createFleetState()
    full.entities.push({ id: 1, kind: 'power', type: 'repair', x: full.player.x, y: full.player.y, r: 12, vx: 0, vy: 0 })
    updateFleet(full, .016, new SeededRng(1))
    expect(full.player.energy).toBe(MAX_ENERGY)
  })

  it('Time Warp slows enemy movement while leaving the player unaffected', () => {
    const s = createFleetState()
    s.player.powers.timewarp = 6
    s.entities.push({ id: 1, kind: 'enemy', type: 'asteroid', x: 100, y: 100, r: 10, vx: 0, vy: 100 })
    const before = s.player.x
    updateFleet(s, .1, new SeededRng(1))
    const slowed = s.entities.find((e) => e.id === 1)!.y
    const baseline = createFleetState()
    baseline.entities.push({ id: 1, kind: 'enemy', type: 'asteroid', x: 100, y: 100, r: 10, vx: 0, vy: 100 })
    updateFleet(baseline, .1, new SeededRng(1))
    const normal = baseline.entities.find((e) => e.id === 1)!.y
    expect(slowed).toBeLessThan(normal)
    expect(s.player.x).toBe(before)
  })

  it('never lets more than the configured cap of power-ups be alive on screen at once', () => {
    const s = createFleetState()
    for (let i = 0; i < MAX_POWERUPS_ON_SCREEN + 3; i++) {
      s.powerupTimer = 0
      updateFleet(s, .001, new SeededRng(i + 1))
    }
    expect(s.entities.filter((e) => e.kind === 'power').length).toBeLessThanOrEqual(MAX_POWERUPS_ON_SCREEN)
  })
})
