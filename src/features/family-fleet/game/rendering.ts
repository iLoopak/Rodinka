import { difficultyFor, type FleetState, type PowerType } from './core'
import { DEFAULT_LOADOUT, type FleetLoadout } from '../cosmetics'
import { powerupDefinition } from './powerups'
import { drawCabin, drawEngineTrail, drawHull, drawImpact, drawWings } from './cosmeticsRendering'

const IMPACT_DURATION = .6
const PICKUP_DURATION = .5

function drawPowerupBurst(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, progress: number) {
  const fade = Math.max(0, 1 - progress)
  ctx.globalAlpha = fade
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.beginPath(); ctx.arc(x, y, 8 + progress * 26, 0, Math.PI * 2); ctx.stroke()
  ctx.globalAlpha = 1
}

export function renderFleet(ctx: CanvasRenderingContext2D, s: FleetState, accent: string, reduced = false, loadout: FleetLoadout = DEFAULT_LOADOUT) {
  const d = difficultyFor(s.time, s.score)
  // Sense-of-speed: parallax moves faster and gets a bit denser as
  // difficulty ramps, without ever touching FOV/zoom. Reduced-motion keeps
  // it at the calm baseline.
  const speedMul = reduced ? 1 : d.parallaxMul
  const starCount = reduced ? 50 : Math.min(90, 50 + Math.floor((d.parallaxMul - 1) * 40))
  const shakeMag = reduced ? 0 : s.shake * 5
  const jx = shakeMag ? (Math.random() - .5) * shakeMag : 0
  const jy = shakeMag ? (Math.random() - .5) * shakeMag : 0

  ctx.clearRect(-10, -10, s.w + 20, s.h + 20)
  ctx.save()
  ctx.translate(jx, jy)

  const g = ctx.createLinearGradient(0, 0, 0, s.h)
  g.addColorStop(0, '#11182f'); g.addColorStop(1, '#050710')
  ctx.fillStyle = g; ctx.fillRect(0, 0, s.w, s.h)

  ctx.fillStyle = '#fff'
  for (let i = 0; i < starCount; i++) {
    const x = (i * 73 + s.time * 12 * speedMul) % s.w
    const y = (i * 137 + s.time * (12 + (i % 3) * 15) * speedMul) % s.h
    ctx.globalAlpha = .25 + (i % 4) * .15
    ctx.fillRect(x, y, 2, 2)
  }
  ctx.globalAlpha = 1

  if (s.player.powers.timewarp > 0) {
    ctx.fillStyle = 'rgba(94,200,255,.08)'
    ctx.fillRect(0, 0, s.w, s.h)
  }

  for (const e of s.entities) {
    if (e.kind === 'bullet') {
      ctx.fillStyle = '#b9f7ff'; ctx.shadowColor = '#7cecff'; ctx.shadowBlur = 10
      ctx.beginPath(); ctx.roundRect(e.x - e.r * .75, e.y - e.r * 2.5, e.r * 1.5, e.r * 4.5, e.r)
      ctx.fill(); ctx.shadowBlur = 0
    } else if (e.kind === 'star') {
      ctx.fillStyle = '#f2c85b'
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill()
    } else if (e.kind === 'power') {
      const def = powerupDefinition(e.type as PowerType)
      ctx.strokeStyle = def.color; ctx.lineWidth = 4
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = '#fff'
      ctx.fillText(def.icon, e.x - 5, e.y + 5)
    } else {
      ctx.fillStyle = e.type === 'comet' ? '#7d6f66' : e.type === 'scout' ? '#cc859f' : e.type === 'drifter' ? '#a89bcb' : '#9b8a77'
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#fff5'; ctx.stroke()
    }
  }

  for (const impact of s.impacts) {
    const progress = Math.min(1, (s.time - impact.t) / IMPACT_DURATION)
    drawImpact(ctx, loadout.hitEffect, impact.x, impact.y, progress)
  }

  for (const pickup of s.pickups) {
    const progress = Math.min(1, (s.time - pickup.t) / PICKUP_DURATION)
    drawPowerupBurst(ctx, pickup.x, pickup.y, powerupDefinition(pickup.type).color, progress)
  }

  const p = s.player
  if (p.powers.shield > 0) {
    ctx.strokeStyle = powerupDefinition('shield').color; ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(p.x, p.y, 30, 0, Math.PI * 2); ctx.stroke()
  }
  if (p.inv > 0 && !reduced) ctx.globalAlpha = .55 + .35 * Math.sin(s.time * 24)
  const trailIntensity = reduced ? 1 : 1 + Math.min(.5, (d.parallaxMul - 1) * .5)
  drawEngineTrail(ctx, loadout.engineTrail, p.x, p.y, s.time, accent, trailIntensity)
  drawHull(ctx, loadout.hull, p.x, p.y, accent)
  drawWings(ctx, loadout.wings, p.x, p.y, accent, s.time)
  drawCabin(ctx, loadout.cabin, p.x, p.y)
  ctx.globalAlpha = 1

  ctx.restore()
}
