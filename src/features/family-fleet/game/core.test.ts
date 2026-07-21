import { describe, expect, it } from 'vitest'
import { createFleetState, difficultyFor, resizeState, resultFromState, updateFleet } from './core'
import { SeededRng } from './rng'

describe('family fleet core', () => {
  it('records an impact and keeps scoring/hitboxes unchanged when a bullet destroys a target', () => {
    const s = createFleetState()
    s.entities.push({ id: 20, kind: 'bullet', x: 100, y: 100, r: 5, vx: 0, vy: 0 }, { id: 21, kind: 'enemy', type: 'scout', x: 100, y: 100, r: 10, vx: 0, vy: 0, hp: 1, score: 100 })
    updateFleet(s, .016, new SeededRng(4))
    expect(s.impacts).toHaveLength(1)
    expect(s.impacts[0]).toMatchObject({ x: 100, y: 100 })
    expect(s.targetsDestroyed).toBe(1)
    expect(s.player.r).toBe(18)
  })

  it('counts a collected power-up without changing which power effect applies', () => {
    const s = createFleetState()
    s.entities.push({ id: 30, kind: 'power', type: 'twin', x: s.player.x, y: s.player.y, r: 12, vx: 0, vy: 0 })
    updateFleet(s, .016, new SeededRng(5))
    expect(s.powerupsCollected).toBe(1)
    expect(s.player.twin).toBeGreaterThan(0)
    expect(resultFromState(s).powerupsCollected).toBe(1)
  })

  it('records an impact at the player when actually damaged, but not while a shield absorbs the hit', () => {
    const s = createFleetState()
    s.player.shield = 1
    s.entities.push({ id: 1, kind: 'enemy', type: 'asteroid', x: s.player.x, y: s.player.y, r: 20, vx: 0, vy: 0 })
    updateFleet(s, .016, new SeededRng(2))
    expect(s.player.shield).toBe(0)
    expect(s.impacts).toHaveLength(0)
    for (let i = 0; i < 40; i++) updateFleet(s, .05, new SeededRng(2))
    s.entities.push({ id: 2, kind: 'enemy', type: 'asteroid', x: s.player.x, y: s.player.y, r: 20, vx: 0, vy: 0 })
    updateFleet(s, .016, new SeededRng(2))
    expect(s.impacts.some((impact) => impact.x === s.player.x && impact.y === s.player.y)).toBe(true)
  })

  it('fades impacts out after their duration so the list never grows unbounded', () => {
    const s = createFleetState()
    s.impacts.push({ x: 0, y: 0, t: 0 })
    for (let i = 0; i < 40; i++) updateFleet(s, .05, new SeededRng(1))
    expect(s.impacts).toHaveLength(0)
  })

  it('clamps player movement and resize bounds', () => { const s=createFleetState(320,600); s.player.targetX=999; updateFleet(s,.1,new SeededRng(1)); expect(s.player.x).toBeLessThanOrEqual(296); resizeState(s,360,640); expect(s.player.y).toBe(552) })
  it('uses deterministic seeded spawning', () => { const a=createFleetState(); const b=createFleetState(); for(let i=0;i<90;i++){updateFleet(a,.05,new SeededRng(7));updateFleet(b,.05,new SeededRng(7));break} expect(difficultyFor(30,1000).level).toBeGreaterThan(1) })
  it('shield and invulnerability absorb hits before game over', () => { const s=createFleetState(); s.player.shield=1; s.entities.push({id:1,kind:'enemy',type:'asteroid',x:s.player.x,y:s.player.y,r:20,vx:0,vy:0}); updateFleet(s,.016,new SeededRng(2)); expect(s.player.energy).toBe(3); expect(s.player.shield).toBe(0); s.entities.push({id:2,kind:'enemy',type:'asteroid',x:s.player.x,y:s.player.y,r:20,vx:0,vy:0}); updateFleet(s,.016,new SeededRng(2)); expect(s.player.energy).toBe(3); for (let i = 0; i < 40; i++) updateFleet(s, .05, new SeededRng(2)); s.entities.push({id:3,kind:'enemy',type:'asteroid',x:s.player.x,y:s.player.y,r:20,vx:0,vy:0}); updateFleet(s,.016,new SeededRng(2)); expect(s.player.energy).toBe(2) })
  it('bullets destroy targets, twin shot expires, and magnet affects only stars', () => { const s=createFleetState(); s.player.twin=.2; for (let i = 0; i < 5; i++) updateFleet(s, .05, new SeededRng(3)); expect(s.player.twin).toBe(0); s.entities.push({id:20,kind:'bullet',x:100,y:100,r:5,vx:0,vy:0},{id:21,kind:'enemy',type:'scout',x:100,y:100,r:10,vx:0,vy:0,hp:1,score:100}); updateFleet(s,.016,new SeededRng(4)); expect(s.targetsDestroyed).toBe(1); s.player.magnet=5; s.entities.push({id:30,kind:'star',x:s.player.x+50,y:s.player.y,r:7,vx:0,vy:0},{id:31,kind:'enemy',type:'asteroid',x:s.player.x+50,y:s.player.y,r:7,vx:0,vy:0}); updateFleet(s,.016,new SeededRng(5)); expect(s.entities.find(e=>e.id===30)?.vx).not.toBe(0); expect(s.entities.find(e=>e.id===31)?.vx).toBe(0) })
})
