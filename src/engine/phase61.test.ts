/** Phase 6.1 — independent fighters take places on AI cards; belts explain their scarcity. */
import { describe, expect, it } from 'vitest'
import { createNewGame } from './worldgen'
import { advanceOneWeek } from './tick'
import { BALANCE } from './balance'
import { titleBoard } from './business/views'
import type { GameState } from './types'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const mk = (seed: string) => createNewGame({ seed, promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
const flag = BALANCE.fights.ai as { freeAgentFill: boolean }

function bouts(seed: string, weeks: number, fill: boolean) {
  flag.freeAgentFill = fill
  try {
    let s: GameState = mk(seed)
    const start = new Map(Object.values(s.fighters).filter((f) => f.status === 'active' && f.contractId === null).map((f) => [f.id, f.record.wins + f.record.losses + f.record.draws]))
    for (let w = 0; w < weeks; w++) s = advanceOneWeek(s)
    let n = 0, zero = 0, total = 0
    for (const [id, b0] of start) {
      const f = s.fighters[id]
      if (!f || f.status !== 'active') continue
      n++
      const d = f.record.wins + f.record.losses + f.record.draws - b0
      total += d
      if (d === 0) zero++
    }
    return { s, n, zero: zero / Math.max(1, n), mean: total / Math.max(1, n) / (weeks / 52) }
  } finally { flag.freeAgentFill = true }
}

describe('independent fighters on AI cards', () => {
  it('fewer unsigned fighters go a year without a bout, and the switch really turns it off', () => {
    const off = bouts('p61-a', 104, false)
    const on = bouts('p61-a', 104, true)
    expect(off.n).toBeGreaterThan(40)
    expect(on.zero, `with the fill ${(on.zero * 100).toFixed(0)}% idle vs ${(off.zero * 100).toFixed(0)}% without`).toBeLessThan(off.zero * 0.6)
    expect(on.mean).toBeGreaterThan(off.mean)
    // a busier pool, not a manufactured one: nobody averages more than three bouts a year across the whole group
    expect(on.mean).toBeLessThan(3)
  }, 240_000)

  it('a fight with an independent principal is paid per fight, in the fight terms, and never involves the player', () => {
    flag.freeAgentFill = true
    let s: GameState = mk('p61-b')
    let seen = 0
    const player = s.playerPromotionId
    for (let w = 0; w < 80; w++) {
      s = advanceOneWeek(s)
      for (const f of Object.values(s.fights)) {
        if (f.kind !== 'ai' || f.sideA.promotionId !== null) continue
        seen++
        expect(f.organiserId).not.toBe(player)
        expect(f.terms.purseA, `fight ${f.id} has an independent principal with no purse`).toBeGreaterThan(0)
      }
    }
    expect(seen, 'the world staged fights with independent principals').toBeGreaterThan(0)
  }, 240_000)

  it('building cards is deterministic: the same seed gives the same fights', () => {
    const run = () => { let s: GameState = mk('p61-c'); for (let w = 0; w < 52; w++) s = advanceOneWeek(s); return JSON.stringify(Object.values(s.fights).map((f) => [f.id, f.sideA.fighterId, f.sideB.fighterId, f.day, f.status])) }
    expect(run()).toBe(run())
  }, 240_000)
})

describe('a vacant belt says why', () => {
  it('names the number of credible contenders it has, and the standard a challenger must meet', () => {
    let s: GameState = mk('p61-d')
    for (let w = 0; w < 90; w++) s = advanceOneWeek(s)
    let vacant = 0
    for (const level of ['world', 'european', 'domestic', 'area'] as const) {
      for (const wc of new Set(Object.values(s.fighters).map((f) => f.weightClass))) {
        for (const c of titleBoard(s, level, wc)) {
          if (c.state !== 'vacant') continue
          vacant++
          expect(c.note).toMatch(/^Vacant/)
          expect(c.note).toMatch(/leading contenders are|Only .* is a credible contender|credible challenger/)
          expect(c.note).not.toMatch(/Waiting for enough rated contenders/)
        }
      }
    }
    expect(vacant, 'this world has a vacant belt to read').toBeGreaterThan(0)
  }, 240_000)
})

import { titleBonus, titleRelevant } from './media/titles'
describe('the matchmaker\'s shortcut changes nothing', () => {
  it('a fighter titleRelevant calls irrelevant never earns a title bonus with anyone', () => {
    let s: GameState = mk('p61-e')
    for (let w = 0; w < 100; w++) s = advanceOneWeek(s)
    const all = Object.values(s.fighters).filter((f) => f.status === 'active')
    let irrelevant = 0, relevant = 0
    for (const x of all.slice(0, 120)) {
      const r = titleRelevant(s, x.id, x.weightClass)
      if (r) { relevant++; continue }
      irrelevant++
      for (const o of all.filter((y) => y.weightClass === x.weightClass && y.id !== x.id)) expect(titleBonus(s, x.id, o.id, x.weightClass), `${x.id} vs ${o.id}`).toBe(0)
    }
    expect(irrelevant).toBeGreaterThan(20)
    expect(relevant).toBeGreaterThan(0)
  }, 240_000)
})

import { activateTitles, qualifiesFor } from './media/titles'
import { getList } from './media/records'
import { SANCTIONING } from './media/orgs'
import { TITLE_DEF_BY_ID } from './business/titleDefs'
import { WEIGHT_CLASSES } from '../data/weightClasses'
import { cloneState } from './clone'
describe('opening and closing belts decides exactly as before', () => {
  it('the lazy credible-challenger count gives the same belts as counting everyone', () => {
    let s: GameState = mk('p61-f')
    let compared = 0
    for (let w = 1; w <= 140; w++) {
      s = advanceOneWeek(s)
      if (w % 7) continue
      const a = cloneState(s), b = cloneState(s)
      activateTitles(a, a.media!)
      // the old rule, written out: count every credible entry, then decide
      for (const org of SANCTIONING) {
        const d = TITLE_DEF_BY_ID[org.id]
        for (const wc of WEIGHT_CLASSES) {
          const k = `${org.id}|${wc.id}`
          const rec = b.media!.titles[k]
          const entries = (getList(b.media!, org.id, wc.id)?.e ?? []).filter((e) => e.r >= 1)
          const credible = entries.filter((e) => qualifiesFor(b, org.id, e.f)).length
          const need = d.level === 'world' ? 4 : 3
          if (!rec && entries.length >= d.minPool && credible >= need) b.media!.titles[k] = { c: null, since: b.today, defences: 0, lastFight: b.today, vacantSince: b.today }
          else if (rec && !rec.c && !rec.elim && (entries.length < d.minPool || credible < 2) && rec.vacantSince !== undefined && b.today - rec.vacantSince > 52 * 7) delete b.media!.titles[k]
          compared++
        }
      }
      expect(JSON.stringify(a.media!.titles)).toBe(JSON.stringify(b.media!.titles))
    }
    expect(compared).toBeGreaterThan(1000)
  }, 240_000)
})

import { appraise, appraiseRating } from './market'
describe('the rating-only appraisal is the same number', () => {
  it('appraiseRating equals appraise().rating for every promotion and fighter', () => {
    let s: GameState = mk('p61-g')
    for (let w = 0; w < 20; w++) s = advanceOneWeek(s)
    let n = 0
    for (const p of Object.values(s.promotions).filter((x) => x.ai)) for (const f of Object.values(s.fighters).slice(0, 40)) { expect(appraiseRating(s, p, f)).toBe(appraise(s, p, f).rating); n++ }
    expect(n).toBeGreaterThan(100)
  })
})
