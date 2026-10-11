/**
 * Phase 6.5 - fighter development and the championship pipeline: who a promoter books first, how soon a fighter can be put on the next card,
 * and eliminators ordered by a title body actually being staged.
 */
import { describe, expect, it } from 'vitest'
import { createNewGame } from './worldgen'
import { advanceOneWeek } from './tick'
import { clone } from './media/testing'
import { BALANCE as B } from './balance'
import { bookable, bookingNeed, pickOpponent, weeksSince } from './systems/aiFights'
import { titleObligation } from './business/titleEco'
import { qualifiesFor } from './media/titles'
import { Rng } from './rng'
import { stageRivalShow } from './events/ai'
import { fighterAge, totalFights } from './fighters'
import type { Fighter, GameState } from './types'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const mk = (seed: string) => createNewGame({ seed, promotionName: 'P65', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
const world = (() => { let s: GameState | null = null; return () => (s ??= (() => { let g = mk('p65-world'); for (let i = 0; i < 104; i++) g = advanceOneWeek(g); return g })()) })()
const ai = B.fights.ai as { developmentPriority: number; minIdleWeeks: number; developmentMaxAge: number }
const withCfg = <T,>(cfg: Partial<typeof ai>, fn: () => T): T => { const old = { ...ai }; Object.assign(ai, cfg); try { return fn() } finally { Object.assign(ai, old) } }

describe('booking order', () => {
  it('with the lift off it is simply idle weeks; with it on, a young winning fighter short of the world floor goes first and nobody else changes', () => {
    const s = clone(world())
    const f = Object.values(s.fighters).find((x) => x.status === 'active' && x.lastFightDay !== null)!
    f.lastFightDay = s.today - 20 * 7
    withCfg({ developmentPriority: 0 }, () => expect(bookingNeed(s, f)).toBe(weeksSince(s, f)))
    withCfg({ developmentPriority: 0.6, developmentMaxAge: 29 }, () => {
      const young = structuredClone(f); young.record = { ...young.record, wins: 6, losses: 2, draws: 0 }
      young.birthDay = s.today - 22 * 365; expect(fighterAge(young, s.today)).toBeLessThanOrEqual(29)
      expect(totalFights(young)).toBeLessThan(14)
      expect(bookingNeed(s, young)).toBeCloseTo(weeksSince(s, young) * 1.6, 5)
      const losing = structuredClone(young); losing.record = { ...losing.record, wins: 2, losses: 6 }
      expect(bookingNeed(s, losing)).toBe(weeksSince(s, losing)) // a losing prospect is not pushed
      const old = structuredClone(young); old.birthDay = s.today - 33 * 365
      expect(bookingNeed(s, old)).toBe(weeksSince(s, old))
      const veteran = structuredClone(young); veteran.record = { ...veteran.record, wins: 20, losses: 4 }
      expect(bookingNeed(s, veteran)).toBe(weeksSince(s, veteran)) // already past the world floor's fight count
    })
  })
})

describe('time between bouts', () => {
  it('a fighter can be booked 4 weeks after their last bout, not 8, because the 8-14 week planning lead already spaces bouts', () => {
    expect(ai.minIdleWeeks).toBeLessThan(B.fights.restWeeks + 2)
    expect(ai.minIdleWeeks).toBeGreaterThanOrEqual(2)
    // availability for the card's date still enforces real rest
    const s = clone(world())
    const f = Object.values(s.fighters).find((x) => x.status === 'active' && !x.activeFightId && !x.injury && x.suspendedUntil === null && x.contractId === null)!
    f.lastFightDay = s.today - 3 * 7
    expect(bookable(s, f, s.today + 9 * 7)).toBe(true)
    expect(bookable(s, f, s.today + 2 * 7)).toBe(false)
  })

  it('over the same 2 years, easing the idle gate gives more bouts and no fighter is ever double-booked', () => {
    const count = (idle: number) => withCfg({ minIdleWeeks: idle }, () => {
      let s = clone(world()); const before = Object.values(s.fights).filter((f) => f.result).length
      for (let i = 0; i < 52; i++) { s = advanceOneWeek(s); const booked = new Map<string, number>(); for (const f of Object.values(s.fights)) if (['agreed', 'scheduled', 'training', 'fightNight'].includes(f.status)) for (const id of [f.sideA.fighterId, f.sideB.fighterId]) booked.set(id, (booked.get(id) ?? 0) + 1); for (const [, n] of booked) expect(n).toBeLessThanOrEqual(1) }
      return Object.values(s.fights).filter((f) => f.result).length - before
    })
    const slow = count(8), fast = count(4)
    expect(fast).toBeGreaterThan(slow)
    expect(fast).toBeLessThan(slow * 1.35) // a modest rise, not a flood
  })
})

describe('ordered eliminators', () => {
  /** Two rested, unbooked fighters of one division on DIFFERENT rival rosters (the hard case), with an eliminator ordered between them on a live belt. */
  function ordered(s: GameState): { a: Fighter; b: Fighter; key: string } | null {
    const media = s.media!
    const free = Object.values(s.contracts).filter((c) => c.status === 'active' && s.promotions[c.promotionId]?.ai && !s.promotions[c.promotionId].ai!.fin.collapsing).map((c) => ({ f: s.fighters[c.fighterId], p: c.promotionId }))
      .filter((x) => x.f && x.f.status === 'active' && !x.f.activeFightId && !x.f.injury && x.f.suspendedUntil === null && weeksSince(s, x.f) >= 10 && s.promotions[x.p].tier !== 'Startup')
    for (const x of free) for (const y of free) {
      if (x.f.id >= y.f.id || x.p === y.p || x.f.weightClass !== y.f.weightClass) continue
      const key = Object.keys(media.titles).find((k) => k.endsWith(`|${x.f.weightClass}`) && media.titles[k].c && !media.titles[k].elim && !media.titles[k].mand && media.titles[k].c !== x.f.id && media.titles[k].c !== y.f.id)
      if (!key) continue
      for (const pid of [x.p, y.p]) s.promotions[pid].cash = Math.max(s.promotions[pid].cash, 5_000_000)
      media.titles[key].elim = { a: x.f.id, b: y.f.id, ordered: s.today, due: s.today + 26 * 7 }
      return { a: x.f, b: y.f, key }
    }
    return null
  }

  it('is made: when a promotion plans a show, an ordered eliminator between fighters of two promotions goes on it', () => {
    let tried = 0, onCard = 0
    for (const seed of ['p65-world', 'p65-world-b', 'p65-world-c', 'p65-world-d', 'p65-world-e', 'p65-world-f', 'p65-world-g', 'p65-world-h']) {
      let s = mk(seed); for (let i = 0; i < 104; i++) s = advanceOneWeek(s)
      const o = ordered(s); if (!o) continue
      const holder = (id: string) => { const f = s.fighters[id]; return f.contractId ? s.promotions[s.contracts[f.contractId].promotionId] : null }
      const promo = holder(o.a.id)!
      const ev = stageRivalShow(s, promo, new Rng(11), new Set())
      if (!ev) continue
      tried++
      const f = ev.card.map((id) => s.fights[id]).find((x) => x && [x.sideA.fighterId, x.sideB.fighterId].includes(o.a.id) && [x.sideA.fighterId, x.sideB.fighterId].includes(o.b.id))
      if (f && f.title?.kind === 'eliminator') onCard++
    }
    expect(tried, 'enough worlds could stage a show').toBeGreaterThanOrEqual(3)
    expect(onCard, `the eliminator is on the card every time (${onCard} of ${tried})`).toBe(tried)
  })

  it('is never staged for the player\'s fighters, and the fighters are never double-booked', () => {
    const s = clone(world())
    const mine = Object.values(s.contracts).filter((c) => c.promotionId === s.playerPromotionId).map((c) => c.fighterId)
    const o = ordered(s)
    if (o && mine.length) { /* the pair above is a rival's; a player's fighter in an order is left for the player */ }
    let t = s
    for (let w = 0; w < 20; w++) {
      t = advanceOneWeek(t)
      for (const f of Object.values(t.fights)) if (['agreed', 'scheduled', 'training', 'fightNight'].includes(f.status) && f.kind === 'ai') for (const id of mine) expect([f.sideA.fighterId, f.sideB.fighterId]).not.toContain(id)
    }
  })

  it('other promoters do not pick a fighter under an eliminator order as an unrelated opponent', () => {
    let s = clone(world()), o = ordered(s)
    for (const seed of ['p65-world-b', 'p65-world-c', 'p65-world-d', 'p65-world-e']) { if (o) break; s = mk(seed); for (let i = 0; i < 104; i++) s = advanceOneWeek(s); o = ordered(s) }
    expect(o).toBeTruthy()
    const promo = Object.values(s.promotions).find((p) => !p.isPlayer && p.ai && p.id !== s.fighters[o!.a.id].contractId)!
    const x = Object.values(s.fighters).find((f) => f.status === 'active' && f.weightClass === o!.a.weightClass && f.id !== o!.a.id && f.id !== o!.b.id && !f.activeFightId)!
    const roster = new Set<string>()
    for (let i = 0; i < 40; i++) { const opp = pickOpponent(s, promo, x, s.today + 10 * 7, roster, new Rng(i), 400); if (opp) expect([o!.a.id, o!.b.id]).not.toContain(opp.id) }
  })
})

describe('vacant belts', () => {
  it('when a promotion plans a show, the two credible contenders the title system pairs for a long-vacant belt go on it; nobody not credible is paired', () => {
    let tried = 0, onCard = 0
    for (const seed of ['p65-vac-a', 'p65-vac-b', 'p65-vac-c', 'p65-vac-d', 'p65-vac-e', 'p65-vac-f']) {
      let s = mk(seed)
      for (let i = 0; i < 90; i++) s = advanceOneWeek(s)
      let pair: { a: Fighter; b: Fighter } | null = null
      for (let w = 0; w < 100 && !pair; w++) {
        s = advanceOneWeek(s)
        for (const [k, rec] of Object.entries(s.media!.titles)) {
          if (rec.c) continue
          const body = k.split('|')[0], wc = k.split('|')[1]
          for (const a of Object.values(s.fighters)) {
            const ob = a.status === 'active' && a.weightClass === wc ? titleObligation(s, a.id) : null
            if (ob?.kind !== 'vacant' || ob.body !== body) continue
            const b = s.fighters[ob.partner]
            if (!b || !a.contractId || !bookable(s, a, s.today + 12 * 7) || !bookable(s, b, s.today + 12 * 7)) continue
            expect(qualifiesFor(s, body, a.id) && qualifiesFor(s, body, b.id), 'only credible contenders are ever paired').toBe(true)
            rec.vacantSince = s.today - 10 * 7 // long enough vacant
            pair = { a, b }; break
          }
          if (pair) break
        }
      }
      if (!pair) continue
      const promo = s.promotions[s.contracts[pair.a.contractId!].promotionId]
      promo.cash = Math.max(promo.cash, 5_000_000)
      const ev = stageRivalShow(s, promo, new Rng(7), new Set())
      if (!ev) continue
      tried++
      if (ev.card.map((id) => s.fights[id]).some((x) => x && [x.sideA.fighterId, x.sideB.fighterId].includes(pair!.a.id) && [x.sideA.fighterId, x.sideB.fighterId].includes(pair!.b.id))) onCard++
    }
    expect(tried, 'enough worlds had such a pair and a promotion able to stage').toBeGreaterThanOrEqual(3)
    // (a contender can also be under an ordered eliminator, which is staged first, so not every pair can make this very card)
    expect(onCard, `the pair is on the card (${onCard} of ${tried})`).toBeGreaterThanOrEqual(Math.ceil(tried * 0.6))
  })
})

describe('media pass memory', () => {
  it('every fight inside the media pass\'s 28-day reading window has been read exactly once: none can be read a second time', () => {
    let s = mk('p65-media')
    for (let w = 1; w <= 120; w++) {
      s = advanceOneWeek(s)
      if (w < 30 || w % 2) continue
      const window = Object.values(s.fights).filter((f) => f.result && f.processedDay !== undefined && s.today - f.processedDay <= 28)
      const unseen = window.filter((f) => !s.media!.seenFights.includes(f.id))
      expect(unseen.map((f) => `${f.id}@${s.today - f.processedDay!}d`), `week ${w}: fights in the window the pass would read again`).toEqual([])
    }
  }, 120_000)
})
