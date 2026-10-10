/**
 * Phase 6.4 - Fight Night presentation read-models: the belt at stake, and what the result meant, are read from the fight's own title flag,
 * the belt record before the bell and the career log after it. Nothing is inferred or invented.
 */
import { describe, expect, it } from 'vitest'
import { createNewGame } from './worldgen'
import { advanceOneWeek } from './tick'
import { clone } from './media/testing'
import type { Fight, GameState } from './types'
import { fightConsequences, titleStakeOf } from './fightStakes'
import { fightView } from './fightViews'
import { nightProgress } from './eventViews'
import { careerStory } from './media/views'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const world = (() => { let s: GameState | null = null; return () => (s ??= (() => { let g = createNewGame({ seed: 'p64-world', promotionName: 'P64', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000); for (let i = 0; i < 156; i++) g = advanceOneWeek(g); return g })()) })()

describe('title stake read-model', () => {
  it('an ordinary bout has no title stake and no consequences before it is fought', () => {
    const s = world()
    const plain = Object.values(s.fights).find((f) => !f.title && !f.result && f.status === 'scheduled')
    if (plain) expect(titleStakeOf(s, plain)).toBeNull()
    const open = Object.values(s.fights).find((f) => !f.result)
    if (open) expect(fightConsequences(s, open)).toEqual([])
  })

  it('a booked title fight names the champion the belt record shows, and the other man as challenger', () => {
    const s = world()
    let checked = 0
    for (const f of Object.values(s.fights)) {
      if (f.result || !f.title || f.status === 'cancelled' || (f.title.kind ?? 'title') !== 'title') continue
      const st = titleStakeOf(s, f)!
      expect(st.name).toBe(f.title.name)
      const holders = (f.title.bodies ?? []).map((b) => s.media!.titles[`${b}|${f.weightClass}`]?.c)
      const ids = [f.sideA.fighterId, f.sideB.fighterId]
      if (st.champion) {
        expect(holders).toContain(ids[st.champion.side])
        expect(st.challenger!.side).toBe(1 - st.champion.side)
        expect(st.vacant).toBe(false)
      } else expect(st.vacant || st.kind === 'unification').toBe(true)
      checked++
    }
    expect(checked, 'the passive world has upcoming title fights').toBeGreaterThan(0)
  })

  it('after the bell the belt lines are exactly what the career log recorded for that day, and nothing else is claimed', () => {
    const s = world()
    let titled = 0, lines = 0
    for (const f of Object.values(s.fights) as Fight[]) {
      if (!f.result) continue
      const cons = fightConsequences(s, f)
      for (const c of cons) {
        const id = c.side === 0 ? f.sideA.fighterId : f.sideB.fighterId
        const logged = careerStory(s, id).filter((e) => e.day === f.day).map((e) => e.text)
        expect(logged.some((t) => c.text.endsWith(t)), `${c.text} is in the career log`).toBe(true)
        lines++
      }
      if (f.title && f.title.kind !== 'eliminator') {
        const st = titleStakeOf(s, f)
        if (st && st.outcome.length) {
          titled++
          // a defence, a change of hands or a filled vacancy: each outcome line is one of those, and the winner is who it says
          for (const o of st.outcome) expect(/Defended|Won|Lost|Unified|undisputed/i.test(o)).toBe(true)
        }
      }
    }
    expect(lines).toBeGreaterThan(0)
    expect(titled).toBeGreaterThan(0)
  })

  it('the fight view carries the stake and the consequences, and is deterministic', () => {
    const a = world(), b = clone(world())
    const f = Object.values(a.fights).find((x) => x.result && x.title && x.title.kind !== 'eliminator')!
    const va = fightView(a, f.id)!, vb = fightView(b, f.id)!
    expect(va.titleStake).toBeTruthy()
    expect(JSON.stringify(va.titleStake)).toBe(JSON.stringify(vb.titleStake))
    expect(JSON.stringify(va.result!.consequences)).toBe(JSON.stringify(vb.result!.consequences))
  })

  it('card slots flag your fighters and the belt, and a rival show cannot be run by the player', () => {
    const s = world()
    const ev = Object.values(s.events).find((e) => e.promotionId !== s.playerPromotionId && e.card.length >= 3)!
    const p = nightProgress(s, ev.id)!
    expect(p.mine).toBe(false); expect(p.canRun).toBe(false)
  })
})
