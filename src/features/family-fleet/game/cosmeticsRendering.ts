import type { CabinId, EngineTrailId, HitEffectId, HullId, WingsId } from '../cosmetics'

// Every hull keeps roughly the same footprint as the original silhouette
// (±26px around the player's x/y) so the visual size stays honest about
// the unchanged 18px hitbox — cosmetics restyle the ship, they don't
// resize its collision area.
export function drawHull(ctx: CanvasRenderingContext2D, hull: HullId, x: number, y: number, accent: string) {
  ctx.fillStyle = accent
  ctx.beginPath()
  if (hull === 'arrow') {
    ctx.moveTo(x, y - 30); ctx.lineTo(x + 15, y + 24); ctx.lineTo(x, y + 14); ctx.lineTo(x - 15, y + 24)
  } else if (hull === 'guardian') {
    ctx.moveTo(x, y - 22); ctx.lineTo(x + 26, y - 2); ctx.lineTo(x + 20, y + 24); ctx.lineTo(x - 20, y + 24); ctx.lineTo(x - 26, y - 2)
  } else if (hull === 'comet') {
    ctx.moveTo(x, y - 28); ctx.quadraticCurveTo(x + 26, y + 2, x + 15, y + 26); ctx.lineTo(x - 15, y + 26); ctx.quadraticCurveTo(x - 26, y + 2, x, y - 28)
  } else {
    ctx.moveTo(x, y - 28); ctx.lineTo(x + 24, y + 24); ctx.lineTo(x, y + 12); ctx.lineTo(x - 24, y + 24)
  }
  ctx.closePath(); ctx.fill()
}

export function drawWings(ctx: CanvasRenderingContext2D, wings: WingsId, x: number, y: number, accent: string, time: number) {
  if (wings === 'none') return
  if (wings === 'doubleFins') {
    ctx.strokeStyle = accent; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(x - 22, y + 20); ctx.lineTo(x - 34, y + 32); ctx.moveTo(x + 22, y + 20); ctx.lineTo(x + 34, y + 32); ctx.stroke()
  } else if (wings === 'orbitalRings') {
    ctx.strokeStyle = accent; ctx.lineWidth = 2
    ctx.beginPath(); ctx.ellipse(x, y + 6, 34, 11, 0, 0, Math.PI * 2); ctx.stroke()
  } else if (wings === 'starPanels') {
    ctx.fillStyle = accent
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(x + side * 30, y + 10); ctx.rotate(time * 0.6 * side)
      ctx.fillRect(-4, -10, 8, 20)
      ctx.restore()
    }
  }
}

export function drawCabin(ctx: CanvasRenderingContext2D, cabin: CabinId, x: number, y: number) {
  ctx.fillStyle = cabin === 'gold' ? '#f2c85b' : cabin === 'night' ? '#1b2440' : '#fff'
  ctx.fillRect(x - 5, y - 6, 10, 18)
  if (cabin === 'familyCrest') {
    ctx.fillStyle = '#E9785E'
    ctx.beginPath(); ctx.arc(x, y + 3, 3, 0, Math.PI * 2); ctx.fill()
  }
}

export function drawEngineTrail(ctx: CanvasRenderingContext2D, trail: EngineTrailId, x: number, y: number, time: number, accent: string) {
  if (trail === 'standard') {
    ctx.fillStyle = 'rgba(255,170,80,.55)'
    ctx.beginPath(); ctx.moveTo(x - 6, y + 16); ctx.lineTo(x + 6, y + 16); ctx.lineTo(x, y + 30 + Math.sin(time * 20) * 3); ctx.closePath(); ctx.fill()
    return
  }
  if (trail === 'double') {
    for (const dx of [-8, 8]) {
      ctx.fillStyle = 'rgba(255,170,80,.5)'
      ctx.beginPath(); ctx.moveTo(x + dx - 4, y + 16); ctx.lineTo(x + dx + 4, y + 16); ctx.lineTo(x + dx, y + 30 + Math.sin(time * 20 + dx) * 3); ctx.closePath(); ctx.fill()
    }
    return
  }
  if (trail === 'stardust') {
    for (let i = 0; i < 6; i++) {
      const a = (time * 1.4 + i / 6) % 1
      ctx.globalAlpha = 1 - a; ctx.fillStyle = '#fff'
      ctx.beginPath(); ctx.arc(x + Math.sin(i + time * 3) * 8, y + 16 + a * 30, 1.6, 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalAlpha = 1
    return
  }
  if (trail === 'familyWave') {
    ctx.strokeStyle = accent; ctx.lineWidth = 3
    ctx.beginPath()
    for (let i = 0; i < 16; i++) {
      const px = x + (i - 8) * 2.4; const py = y + 18 + Math.sin(i * 0.6 + time * 6) * 4 + i * 0.8
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.stroke()
    return
  }
  const hues = ['#E9785E', '#f2c85b', '#8BC6AD', '#8DB9C7', '#a89bcb']
  hues.forEach((color, i) => {
    ctx.fillStyle = color; ctx.globalAlpha = .75
    ctx.beginPath(); ctx.arc(x + (i - 2) * 4, y + 18 + i * 3.4, 3, 0, Math.PI * 2); ctx.fill()
  })
  ctx.globalAlpha = 1
}

// `progress` is 0 at the moment of impact and 1 once the effect has fully
// faded — callers derive it from how long ago the impact happened.
export function drawImpact(ctx: CanvasRenderingContext2D, effect: HitEffectId, x: number, y: number, progress: number) {
  const fade = Math.max(0, 1 - progress)
  if (effect === 'pixelShatter') {
    const n = 8
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2; const dist = progress * 22
      ctx.globalAlpha = fade; ctx.fillStyle = '#fff'
      ctx.fillRect(x + Math.cos(angle) * dist - 2, y + Math.sin(angle) * dist - 2, 4, 4)
    }
  } else if (effect === 'starBurst') {
    const n = 6
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2 + progress; const dist = 6 + progress * 18
      ctx.globalAlpha = fade; ctx.fillStyle = '#f2c85b'
      ctx.beginPath(); ctx.arc(x + Math.cos(angle) * dist, y + Math.sin(angle) * dist, 2.5 * fade + 1, 0, Math.PI * 2); ctx.fill()
    }
  } else {
    ctx.globalAlpha = fade; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(x, y, 10 + progress * 14, 0, Math.PI * 2); ctx.stroke()
  }
  ctx.globalAlpha = 1
}
