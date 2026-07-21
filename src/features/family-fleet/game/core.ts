import type { FamilyFleetRunResult } from '../types'
import type { Rng } from './rng'
import { MAX_POWERUPS_ON_SCREEN, pickWeightedPowerup, powerupDefinition } from './powerups'

export type EnemyType = 'asteroid' | 'drifter' | 'scout' | 'comet'
export type PowerType = 'shield' | 'twin' | 'triple' | 'rapid' | 'magnet' | 'overcharge' | 'repair' | 'timewarp'

export interface Entity {
  id: number
  kind: 'enemy' | 'bullet' | 'star' | 'power'
  type?: EnemyType | PowerType
  x: number; y: number; r: number; vx: number; vy: number
  hp?: number
  /** Damage a bullet deals on hit; only set on bullets (Overcharge raises it). */
  dmg?: number
  score?: number
  age?: number
}

// `impacts` is a purely cosmetic trail of recent hit events (enemy kills and
// player damage) for the equipped hit-effect, screen shake, and sfx to key
// off of — it never feeds back into collision or scoring, so it can't change
// hitboxes or gameplay.
export interface Impact { id: number; x: number; y: number; t: number; kind: 'enemyKill' | 'playerHit'; big?: boolean }

// A short-lived marker for the ring burst + chime a power-up plays when
// collected. Purely cosmetic, same spirit as `impacts`.
export interface PowerupPickup { id: number; x: number; y: number; t: number; type: PowerType }

export const MAX_ENERGY = 3

export interface PlayerState {
  x: number; y: number; r: number; targetX: number
  energy: number
  inv: number
  /** Seconds remaining for each power-up; 0 means inactive. Data-driven — see powerups.ts. */
  powers: Record<PowerType, number>
}

export interface FleetState {
  w: number; h: number
  player: PlayerState
  entities: Entity[]
  time: number
  score: number
  level: number
  stars: number
  targetsDestroyed: number
  highestLevel: number
  powerupsCollected: number
  impacts: Impact[]
  pickups: PowerupPickup[]
  /** Screen-shake magnitude, 0..1, decaying; set on big hits/explosions. */
  shake: number
  /** Increments once per volley fired (not once per bullet) — sfx diffs this to play one shoot sound per volley. */
  volleysFired: number
  over: boolean
  gameOverEmitted: boolean
  spawnTimer: number
  starTimer: number
  powerupTimer: number
  fireTimer: number
  id: number
  paused: boolean
}

const emptyPowers = (): Record<PowerType, number> => ({
  shield: 0, twin: 0, triple: 0, rapid: 0, magnet: 0, overcharge: 0, repair: 0, timewarp: 0,
})

export const createFleetState = (w = 390, h = 720): FleetState => ({
  w, h,
  player: { x: w / 2, y: h - 88, r: 18, targetX: w / 2, energy: MAX_ENERGY, inv: 0, powers: emptyPowers() },
  entities: [],
  time: 0, score: 0, level: 1, stars: 0, targetsDestroyed: 0, highestLevel: 1, powerupsCollected: 0,
  impacts: [], pickups: [], shake: 0, volleysFired: 0,
  over: false, gameOverEmitted: false,
  spawnTimer: 1.2, starTimer: .8, powerupTimer: 9, fireTimer: .25, id: 1, paused: false,
})

export function resizeState(s: FleetState, w: number, h: number) {
  s.w = w; s.h = h
  s.player.y = h - 88
  s.player.x = Math.min(w - 24, Math.max(24, s.player.x))
  s.player.targetX = Math.min(w - 24, Math.max(24, s.player.targetX))
}

const hit = (a: { x: number; y: number; r: number }, b: { x: number; y: number; r: number }) =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= (a.r + b.r) ** 2

export interface Difficulty {
  /** Coarse display number only (HUD, achievements) — gameplay tuning below reads `progress`, not this. */
  level: number
  enemySpeed: number
  spawnInterval: number
  maxConcurrentEnemies: number
  /** Enemy-type roll thresholds: roll > cometThreshold -> comet, else > scoutThreshold -> scout, else > drifterThreshold -> drifter, else asteroid. All shrink as difficulty rises, so harder enemies get more common. */
  cometThreshold: number
  scoutThreshold: number
  drifterThreshold: number
  parallaxMul: number
  /** Multiplies how *rarely* power-ups spawn — <1 means less often than baseline. */
  powerupFreqMul: number
}

/** How much Time Warp slows enemy movement while active (player unaffected). */
export const TIME_WARP_SLOW = .35

// The first 15s hold flat at the gentlest settings on purpose. Past that,
// `progress` is a single continuous curve (never a stepped jump) that every
// tuning knob below reads from, so nothing can visibly jump when a level
// number ticks over — only the display label does. `primary` saturates
// quickly enough that ~2 minutes in already feels much harder; `creep` keeps
// nudging things up slowly forever afterward, since this is an endless mode
// with no final difficulty.
const GRACE_PERIOD = 15

export function difficultyFor(time: number, score: number): Difficulty {
  const t = Math.max(0, time - GRACE_PERIOD)
  const primary = 1 - Math.exp(-t / 55)
  const creep = Math.log(1 + t / 200) * .18
  const scoreBoost = Math.min(.15, score / 40_000)
  const progress = primary + creep + scoreBoost
  return {
    level: 1 + Math.floor(progress * 12),
    enemySpeed: 78 + progress * 130,
    spawnInterval: Math.max(.16, 1.35 - progress * 1.05),
    maxConcurrentEnemies: Math.min(24, Math.round(3 + progress * 11)),
    cometThreshold: Math.max(.55, .93 - progress * .32),
    scoutThreshold: Math.max(.32, .68 - progress * .28),
    drifterThreshold: Math.max(.14, .4 - progress * .2),
    parallaxMul: 1 + progress * .9,
    powerupFreqMul: Math.max(.55, 1 - progress * .4),
  }
}

function add(s: FleetState, e: Omit<Entity, 'id'>) { s.entities.push({ ...e, id: s.id++ }) }

function countKind(s: FleetState, kind: Entity['kind']): number {
  let n = 0
  for (const e of s.entities) if (e.kind === kind) n++
  return n
}

export function spawnEnemy(s: FleetState, rng: Rng) {
  const lanes = 5
  const lane = Math.floor(rng.next() * lanes)
  const x = (lane + .5) * s.w / lanes + (rng.next() - .5) * 18
  const d = difficultyFor(s.time, s.score)
  const roll = rng.next()
  const type: EnemyType = roll > d.cometThreshold ? 'comet' : roll > d.scoutThreshold ? 'scout' : roll > d.drifterThreshold ? 'drifter' : 'asteroid'
  const size = type === 'scout' ? 13 : type === 'comet' ? 24 : 18 + rng.next() * 14
  add(s, {
    kind: 'enemy', type,
    x: Math.max(size, Math.min(s.w - size, x)), y: -size, r: size,
    vx: type === 'drifter' ? 45 : 0,
    vy: d.enemySpeed * (type === 'scout' ? 1.35 : type === 'comet' ? .9 : 1),
    hp: type === 'asteroid' && size > 25 ? 2 : type === 'comet' ? 3 : 1,
    score: type === 'scout' ? 160 : type === 'drifter' ? 120 : type === 'comet' ? 60 : 90,
    age: 0,
  })
}

function spawnPowerup(s: FleetState, rng: Rng, x: number, y: number) {
  if (countKind(s, 'power') >= MAX_POWERUPS_ON_SCREEN) return
  add(s, { kind: 'power', type: pickWeightedPowerup(rng.next()), x, y, r: 12, vx: 0, vy: 80 })
}

function applyPowerup(p: PlayerState, type: PowerType) {
  if (type === 'repair') p.energy = Math.min(MAX_ENERGY, p.energy + 1)
  p.powers[type] = powerupDefinition(type).duration
}

export function updateFleet(s: FleetState, dt: number, rng: Rng) {
  if (s.paused || s.over) return
  dt = Math.min(.05, Math.max(0, dt))
  s.time += dt
  const d = difficultyFor(s.time, s.score)
  s.level = d.level
  s.highestLevel = Math.max(s.highestLevel, s.level)
  s.score = Math.max(0, Math.floor(s.score + dt * 6))

  const p = s.player
  p.x += (Math.max(24, Math.min(s.w - 24, p.targetX)) - p.x) * Math.min(1, dt * 10)
  p.inv = Math.max(0, p.inv - dt)
  for (const key of Object.keys(p.powers) as PowerType[]) p.powers[key] = Math.max(0, p.powers[key] - dt)
  s.shake = Math.max(0, s.shake - dt * 2.4)

  s.fireTimer -= dt
  if (s.fireTimer <= 0) {
    s.fireTimer = p.powers.rapid > 0 ? .11 : .28
    s.volleysFired++
    const bulletR = p.powers.overcharge > 0 ? 7 : 4
    const bulletDmg = p.powers.overcharge > 0 ? 2 : 1
    const xs = p.powers.triple > 0 ? [p.x - 14, p.x, p.x + 14] : p.powers.twin > 0 ? [p.x - 10, p.x + 10] : [p.x]
    xs.forEach((x) => add(s, { kind: 'bullet', x, y: p.y - 22, r: bulletR, vx: 0, vy: -430, dmg: bulletDmg }))
  }

  s.spawnTimer -= dt
  if (s.spawnTimer <= 0) {
    s.spawnTimer = d.spawnInterval
    if (countKind(s, 'enemy') < d.maxConcurrentEnemies) spawnEnemy(s, rng)
  }

  s.starTimer -= dt
  if (s.starTimer <= 0) {
    s.starTimer = .9 + rng.next() * .6
    add(s, { kind: 'star', x: 20 + rng.next() * (s.w - 40), y: -10, r: 7, vx: 0, vy: 90 + (d.enemySpeed - 78) * .15 })
  }

  // Power-ups mostly drop from destroyed enemies; this is the "výjimečně
  // přímo ve vesmíru" exception — a rare direct spawn on its own timer.
  s.powerupTimer -= dt
  if (s.powerupTimer <= 0) {
    s.powerupTimer = (14 + rng.next() * 10) / d.powerupFreqMul
    spawnPowerup(s, rng, 30 + rng.next() * (s.w - 60), -14)
  }

  const enemyTimeScale = p.powers.timewarp > 0 ? TIME_WARP_SLOW : 1
  for (const e of s.entities) {
    const scale = e.kind === 'enemy' ? enemyTimeScale : 1
    e.age = (e.age ?? 0) + dt * scale
    if (e.kind === 'enemy' && e.type === 'drifter') e.vx = Math.sin((e.age ?? 0) * 2.2) * 55
    if (e.kind === 'star' && p.powers.magnet > 0) {
      const dx = p.x - e.x, dy = p.y - e.y, dist = Math.hypot(dx, dy)
      if (dist < 145) { e.vx = dx / dist * 190; e.vy = dy / dist * 190 }
    }
    e.x += e.vx * dt * scale
    e.y += e.vy * dt * scale
  }

  const bullets = s.entities.filter((e) => e.kind === 'bullet')
  for (const b of bullets) {
    for (const e of s.entities) {
      if (e.kind === 'enemy' && hit(b, e)) {
        b.y = -999
        e.hp = (e.hp ?? 1) - (b.dmg ?? 1)
        if (e.hp <= 0) {
          const big = e.type === 'comet'
          s.impacts.push({ id: s.id++, x: e.x, y: e.y, t: s.time, kind: 'enemyKill', big })
          if (big) s.shake = Math.max(s.shake, .5)
          e.y = s.h + 999
          s.score += e.score ?? 50
          s.targetsDestroyed++
          if (rng.next() < .25) add(s, { kind: 'star', x: e.x, y: e.y, r: 7, vx: 0, vy: 80 })
          if (rng.next() < .08 * d.powerupFreqMul) spawnPowerup(s, rng, e.x, e.y)
        }
        break
      }
    }
  }

  for (const e of s.entities) {
    if ((e.kind === 'enemy' || e.kind === 'star' || e.kind === 'power') && hit(p, e)) {
      if (e.kind === 'star') {
        s.stars++; s.score += 35; e.y = s.h + 999
      } else if (e.kind === 'power') {
        const type = e.type as PowerType
        applyPowerup(p, type)
        s.powerupsCollected++
        s.pickups.push({ id: s.id++, x: e.x, y: e.y, t: s.time, type })
        e.y = s.h + 999
      } else if (p.inv <= 0) {
        if (p.powers.shield > 0) {
          p.powers.shield = 0
        } else {
          p.energy--
          s.impacts.push({ id: s.id++, x: p.x, y: p.y, t: s.time, kind: 'playerHit' })
          s.shake = Math.max(s.shake, .35)
        }
        p.inv = 1.5
        if (p.energy <= 0) s.over = true
      }
    }
  }

  s.entities = s.entities.filter((e) => e.y > -80 && e.y < s.h + 80 && e.x > -80 && e.x < s.w + 80)
  s.impacts = s.impacts.filter((i) => s.time - i.t < .6)
  s.pickups = s.pickups.filter((pu) => s.time - pu.t < .5)
}

export function resultFromState(s: FleetState): FamilyFleetRunResult {
  return {
    score: Math.max(0, Math.floor(s.score)),
    survivedMs: Math.floor(s.time * 1000),
    stars: s.stars,
    targetsDestroyed: s.targetsDestroyed,
    highestLevel: s.highestLevel,
    powerupsCollected: s.powerupsCollected,
  }
}
