/**
 * Phase 5.4 — the fight business: market value, expected terms, managers and ambitions, conversations, title ecosystem, venues.
 */
import { describe, expect, it } from 'vitest'
import { createNewGame } from './worldgen'
import { clone } from './media/testing'
import { askTerms } from './market'
import { player } from './selectors'
import { boundedPurse, careerValue, commercialAppeal, fightValue, marketPurse, purseBounds, type FightContext } from './business/marketValue'
import { confidenceFor, expectedContractTerms } from './business/terms'
import { ambitionOf, managerOf } from './business/manager'
import type { Fighter, GameState } from './types'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const fresh = (seed: string) => createNewGame({ seed, promotionName: 'P54', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)

/** A free-agent fighter with the given public standing, in a copy of the state. */
function withStanding(base: GameState, over: Partial<Pick<Fighter, 'reputation' | 'popularity'>> & { wins?: number; losses?: number; ko?: number; momentum?: number }): { s: GameState; f: Fighter } {
  const s = clone(base)
  const f = Object.values(s.fighters).find((x) => x.status === 'active' && !x.contractId && !x.injury)!
  f.reputation = over.reputation ?? f.reputation
  f.popularity = over.popularity ?? f.popularity
  f.record = { wins: over.wins ?? f.record.wins, losses: over.losses ?? f.record.losses, draws: 0, koWins: over.ko ?? 0, koLosses: 0 }
  f.momentum = over.momentum ?? 0
  f.recentFights = []
  f.lastFightDay = s.today - 60
  return { s, f }
}

const ctx = (over: Partial<FightContext> = {}): FightContext => ({ kind: 'standard', level: null, opponentValue: null, billing: 3, broadcast: 'none', venuePrestige: 2, home: true, eventRevenue: null, ...over })

describe('market value: not just popularity', () => {
  const base = fresh('p54-market')
  it('a famous but unaccomplished fighter is not worth a contender’s money', () => {
    const famous = withStanding(base, { reputation: 20, popularity: 90, wins: 5, losses: 10 })
    const contender = withStanding(base, { reputation: 62, popularity: 40, wins: 20, losses: 2, ko: 12 })
    expect(careerValue(famous.s, famous.f)).toBeLessThan(careerValue(contender.s, contender.f) * 0.75)
  })
  it('an unbeaten prospect with modest popularity is worth a prospect’s money, not a star’s', () => {
    const prospect = withStanding(base, { reputation: 28, popularity: 22, wins: 10, losses: 0, ko: 6 })
    const star = withStanding(base, { reputation: 80, popularity: 85, wins: 35, losses: 2, ko: 24, momentum: 50 })
    expect(careerValue(prospect.s, prospect.f)).toBeLessThan(40)
    expect(marketPurse(careerValue(prospect.s, prospect.f))).toBeLessThan(marketPurse(careerValue(star.s, star.f)) / 20)
  })
  it('career value moves with results, activity and age', () => {
    const { s, f } = withStanding(base, { reputation: 55, popularity: 50, wins: 18, losses: 3, ko: 9, momentum: 40 })
    const prime = careerValue(s, f)
    f.lastFightDay = s.today - 7 * 80
    expect(careerValue(s, f)).toBeLessThan(prime)
    f.lastFightDay = s.today - 40
    f.momentum = -60
    expect(careerValue(s, f)).toBeLessThan(prime)
    f.momentum = 40
    f.birthDay = s.today - 38 * 365
    expect(careerValue(s, f)).toBeLessThan(prime * 0.8)
  })
  it('the five ideas are different numbers: career value, commercial appeal and fight value are not interchangeable', () => {
    const { s, f } = withStanding(base, { reputation: 60, popularity: 30, wins: 22, losses: 1, ko: 15 })
    const career = careerValue(s, f), commercial = commercialAppeal(s, f)
    expect(career).not.toBeCloseTo(commercial, 0)
    const std = fightValue(career, ctx()), title = fightValue(career, ctx({ kind: 'title', level: 'world' }))
    expect(title).toBeGreaterThan(std * 1.5)
  })
  it('is deterministic', () => {
    const { s, f } = withStanding(base, { reputation: 48, popularity: 41, wins: 14, losses: 4 })
    expect(careerValue(s, f)).toBe(careerValue(clone(s), s.fighters[f.id]))
  })
})

describe('economic guardrails', () => {
  it('a club-show main event cannot carry a star’s purse, whatever the market says', () => {
    const star = 70, opp = 20
    const smallHall = ctx({ eventRevenue: 60_000, billing: 3 })
    const b = purseBounds(star, opp, smallHall)
    expect(b.market).toBeGreaterThan(200_000)
    expect(b.limited).toBe('ceiling')
    expect(boundedPurse(star, opp, smallHall)).toBeLessThan(45_000)
  })
  it('a world superstar is never priced like a journeyman on a major pay-per-view title fight', () => {
    const big = ctx({ kind: 'title', level: 'world', broadcast: 'ppv', venuePrestige: 5, eventRevenue: 15_000_000, billing: 3 })
    expect(boundedPurse(90, 85, big)).toBeGreaterThan(1_000_000)
    // even if the market figure were somehow tiny, the floor holds the headliner up
    const b = purseBounds(15, 85, big)
    expect(boundedPurse(15, 85, big)).toBeGreaterThanOrEqual(b.floor)
  })
  it('the same fighter earns more as the event earns more', () => {
    const lo = boundedPurse(60, 55, ctx({ eventRevenue: 150_000 })), hi = boundedPurse(60, 55, ctx({ eventRevenue: 3_000_000 }))
    expect(hi).toBeGreaterThan(lo)
  })
  it('belts add value in ladder order, and a unification adds most', () => {
    const v = (kind: FightContext['kind'], level: FightContext['level']) => fightValue(55, ctx({ kind, level }))
    expect(v('title', 'area')).toBeLessThan(v('title', 'domestic'))
    expect(v('title', 'domestic')).toBeLessThan(v('title', 'european'))
    expect(v('title', 'european')).toBeLessThan(v('title', 'world'))
    expect(v('eliminator', 'world')).toBeLessThan(v('title', 'world'))
    expect(v('unification', 'world')).toBeGreaterThan(v('title', 'world'))
  })
  it('poor event economics constrain a purse, a platform and a venue raise it', () => {
    const poor = fightValue(50, ctx({ broadcast: 'none', venuePrestige: 1 })), rich = fightValue(50, ctx({ broadcast: 'ppv', venuePrestige: 5 }))
    expect(rich).toBeGreaterThan(poor)
  })
})

describe('expected terms: ranges, never the reservation price', () => {
  const base = fresh('p54-terms')
  const target = () => { const f = Object.values(base.fighters).find((x) => x.status === 'active' && !x.contractId && x.reputation >= 25)!; return f.id }
  it('gives ranges whose width depends on how well the player knows the camp', () => {
    const id = target()
    const low = expectedContractTerms(base, id, 'signing')!
    const s = clone(base)
    s.business = { v: 1, n: 0, talks: {}, commitments: [], plans: {}, learned: { [id]: ['priority:money', 'ambition', 'timing'] }, neg: { [id]: { talks: 3, agreed: 0, lowballs: 0, walkouts: 0, lastDay: s.today } }, exp: 6, titleHist: {} }
    s.fighters[id].promoRelations[s.playerPromotionId] = 40
    const high = expectedContractTerms(s, id, 'signing')!
    expect(low.confidence.level).toBe('LOW')
    expect(['MODERATE', 'HIGH']).toContain(high.confidence.level)
    const w = (r: { lo: number; hi: number }) => (r.hi - r.lo) / ((r.hi + r.lo) / 2)
    expect(w(high.purse)).toBeLessThan(w(low.purse))
  })
  it('never exposes the exact hidden ask, and the ask cannot be read off the range edges or centre', () => {
    let exactCentre = 0, exactEdge = 0, n = 0
    for (const f of Object.values(base.fighters).filter((x) => x.status === 'active' && !x.contractId).slice(0, 60)) {
      const t = expectedContractTerms(base, f.id, 'signing')!
      const ask = askTerms(base, f, player(base), 'signing').basePurse
      n++
      if (Math.abs((t.purse.lo + t.purse.hi) / 2 - ask) < 1) exactCentre++
      if (t.purse.lo === ask || t.purse.hi === ask) exactEdge++
      expect(Object.keys(t)).not.toContain('reservation')
    }
    expect(exactCentre / n).toBeLessThan(0.05)
    expect(exactEdge / n).toBeLessThan(0.1)
  })
  it('judges an offer against the range: lowball, reasonable, generous', () => {
    const id = target()
    const t0 = expectedContractTerms(base, id, 'signing')!
    const mid = { years: 2, fights: 4, minFightsPerYear: 2, signingBonus: (t0.signing.lo + t0.signing.hi) / 2, weeklyRetainer: (t0.retainer.lo + t0.retainer.hi) / 2, basePurse: (t0.purse.lo + t0.purse.hi) / 2, winBonus: (t0.winBonus.lo + t0.winBonus.hi) / 2, titleBonus: 0, ppvShare: 0, titlePromise: false }
    expect(expectedContractTerms(base, id, 'signing', mid)!.assessment).toBe('Reasonable offer')
    expect(expectedContractTerms(base, id, 'signing', { ...mid, basePurse: mid.basePurse * 0.5, weeklyRetainer: mid.weeklyRetainer * 0.5, winBonus: mid.winBonus * 0.5 })!.assessment).toBe('Lowball')
    expect(expectedContractTerms(base, id, 'signing', { ...mid, basePurse: mid.basePurse * 1.6, weeklyRetainer: mid.weeklyRetainer * 1.6, winBonus: mid.winBonus * 1.6 })!.assessment).toBe('Generous offer')
  })
  it('confidence grows with relationship, talks and what the camp has said', () => {
    const id = target()
    const a = confidenceFor(base, id).score
    const s = clone(base)
    s.fighters[id].promoRelations[s.playerPromotionId] = 50
    expect(confidenceFor(s, id).score).toBeGreaterThan(a)
  })
})

describe('managers and ambitions are hidden, deterministic truths', () => {
  const base = fresh('p54-mgr')
  it('derive from the seed and the fighter, identically each time', () => {
    const f = Object.values(base.fighters).find((x) => x.status === 'active')!
    expect(managerOf(base, f)).toEqual(managerOf(clone(base), f))
    expect(ambitionOf(base, f)).toEqual(ambitionOf(clone(base), f))
  })
  it('produce a spread of archetypes and ambitions across the roster', () => {
    const fs = Object.values(base.fighters).filter((x) => x.status === 'active')
    expect(new Set(fs.map((f) => managerOf(base, f).archetype)).size).toBeGreaterThanOrEqual(6)
    expect(new Set(fs.map((f) => ambitionOf(base, f).kind)).size).toBeGreaterThanOrEqual(5)
  })
})
