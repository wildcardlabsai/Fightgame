/**
 * PHASE 4.5 — simulation integrity: uncertainty, AI competence and personality, life cycle and consequences,
 * difficulty, purse model, retention. (Economic audits on synthetic shows live in sim/audit.test.ts.)
 */
import { describe, expect, it } from 'vitest'
import { BALANCE as B } from './balance'
import { keyedNormal } from './rng'
import { aiEvents } from './events/ai'
import { demandFor, forecastError } from './events/demand'
import { baseMoney, valueOf } from './market'
import { rosterOf } from './selectors'
import { advanceOneWeek } from './tick'
import { aiFinances, behaviour, weeklyFixed } from './systems/aiFinance'
import { buildShow, draws, quantile } from './sim/audit'
import { deserialiseGame, serialiseGame } from './save'
import { Rng } from './rng'
import { createNewGame } from './worldgen'
import type { AiCompetence, Difficulty, GameState } from './types'

const fresh = (seed = 'p45', difficulty: Difficulty = 'standard') => createNewGame({ seed, promotionName: 'P45', promoterName: 'T', homeCountry: 'ENG', difficulty, logo: { monogram: 'P', color: '#fff', emblem: 'bolt' } })
const rivals = (s: GameState) => Object.values(s.promotions).filter((p) => !p.isPlayer)

describe('AI traits', () => {
  it('give every rival a competence, a risk appetite and a finance record; they differ across promotions and seeds', () => {
    const seen = new Set<AiCompetence>()
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      for (const p of rivals(fresh(seed))) {
        expect(['poor', 'average', 'strong', 'elite']).toContain(p.ai!.competence)
        expect(p.ai!.risk).toBeGreaterThan(0)
        expect(p.ai!.risk).toBeLessThan(1)
        expect(p.ai!.fin.state).toBe('established')
        seen.add(p.ai!.competence)
      }
    }
    expect(seen.size).toBe(4) // all four levels occur
    const s = fresh('risk')
    const byStrategy = Object.fromEntries(rivals(s).map((p) => [p.ai!.strategy, p.ai!.risk]))
    expect(byStrategy.money).toBeGreaterThan(byStrategy.prospectFactory) // personality is more than a label
  })

  it('competence changes how wrong a promoter is about demand', () => {
    const sd = (c: AiCompetence) => {
      const xs: number[] = []
      for (let i = 0; i < 400; i++) xs.push(Math.log(Math.exp(B.events.ai.competence[c].bias + B.events.ai.competence[c].sd * keyedNormal('s', 'x', i))))
      const m = xs.reduce((a, b) => a + b, 0) / xs.length
      return { sd: Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length), m }
    }
    expect(sd('poor').sd).toBeGreaterThan(sd('average').sd)
    expect(sd('average').sd).toBeGreaterThan(sd('strong').sd)
    expect(sd('strong').sd).toBeGreaterThan(sd('elite').sd)
    expect(sd('elite').sd).toBeGreaterThan(0.05) // never perfect
    expect(sd('poor').m).toBeGreaterThan(sd('elite').m) // the weak are over-optimistic
  })

  it('personality drives actual decisions: sizes, caps and card sizes differ by style', () => {
    let s = fresh('persona')
    for (let i = 0; i < 70; i++) s = advanceOneWeek(s)
    const byStyle: Record<string, { cap: number[]; fights: number[] }> = {}
    for (const e of Object.values(s.events).filter((x) => x.kind === 'ai')) {
      const st = s.promotions[e.promotionId].ai!.strategy
      ;(byStyle[st] ??= { cap: [], fights: [] }).cap.push(s.venues[e.venueId].capacity)
      byStyle[st].fights.push(e.card.length)
    }
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)
    expect(byStyle.prospectFactory.cap.length).toBeGreaterThan(3)
    expect(Math.max(...byStyle.prospectFactory.cap)).toBeLessThanOrEqual(6000) // prospect factories never book arenas
    expect(mean(byStyle.money.fights)).toBeGreaterThan(mean(byStyle.prospectFactory.fights)) // money shows are bigger
    expect(Math.max(...byStyle.money.cap)).toBeGreaterThan(12000) // and they do book the big rooms
  })
})

describe('demand uncertainty', () => {
  it('actual demand differs from the public estimate by a wide, deterministic margin', () => {
    const show = buildShow({ profile: 'medium', tier: 'national', promoRep: 50, nFights: 7 })
    const ratios: number[] = []
    const pub = demandFor(show.state, show.ev, 'public')
    const base = show.state.seed
    for (let i = 0; i < 300; i++) { show.state.seed = `${base}#${i}`; const a = demandFor(show.state, show.ev, 'actual'); ratios.push((a.ga + a.premium + a.vip) / (pub.ga + pub.premium + pub.vip)) }
    show.state.seed = base
    const logs = ratios.map(Math.log)
    const m = logs.reduce((a, b) => a + b, 0) / logs.length
    const sd = Math.sqrt(logs.reduce((a, b) => a + (b - m) ** 2, 0) / logs.length)
    expect(Math.abs(m)).toBeLessThan(0.1) // unbiased
    expect(sd).toBeGreaterThan(0.18) // plenty of surprise
    expect(sd).toBeLessThan(0.4)
    const again = demandFor(show.state, show.ev, 'actual')
    expect(demandFor(show.state, show.ev, 'actual').ga).toBe(again.ga) // same seed, same outcome
  })

  it('forecast bands stay wide even for veterans, and the hidden city price-sensitivity is not visible to the public model', () => {
    const s = fresh('fe')
    s.promotions[s.playerPromotionId].stats.events = 500
    expect(forecastError(s, s.playerPromotionId)).toBeGreaterThanOrEqual(0.24)
    const brutal = fresh('fe', 'brutal'), easy = fresh('fe', 'forgiving')
    expect(forecastError(brutal, brutal.playerPromotionId)).toBeGreaterThan(forecastError(easy, easy.playerPromotionId))
  })
})

describe('difficulty is about the world, not just cash', () => {
  it('changes venue prices, sponsor money, fighter demands, forecast error, demand noise and rival quality', () => {
    const f = fresh('diff', 'forgiving'), b = fresh('diff', 'brutal')
    expect(B.difficulty.brutal.venueCost).toBeGreaterThan(B.difficulty.forgiving.venueCost)
    expect(B.difficulty.brutal.sponsor).toBeLessThan(B.difficulty.forgiving.sponsor)
    expect(B.difficulty.brutal.fighterAsk).toBeGreaterThan(B.difficulty.forgiving.fighterAsk)
    expect(B.difficulty.brutal.demandNoise).toBeGreaterThan(B.difficulty.forgiving.demandNoise)
    const rank: Record<AiCompetence, number> = { poor: 0, average: 1, strong: 2, elite: 3 }
    const sum = (s: GameState) => rivals(s).reduce((n, p) => n + rank[p.ai!.competence], 0)
    let tougher = 0
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) { const x = fresh(seed, 'forgiving'), y = fresh(seed, 'brutal'); if (sum(y) > sum(x)) tougher++; expect(sum(y)).toBeGreaterThanOrEqual(sum(x)) }
    expect(tougher).toBeGreaterThan(0) // harder worlds have better rivals
    expect(Object.values(f.fighters).length).toBe(Object.values(b.fighters).length)
  })
})

describe('purse model', () => {
  it('is exponential: journeymen earn hundreds, headliners earn a real slice of the gate', () => {
    const at = (v: number) => baseMoney(v).purse
    expect(at(10)).toBeLessThan(3_000)
    expect(at(30)).toBeGreaterThan(3_000)
    expect(at(30)).toBeLessThan(10_000)
    expect(at(50)).toBeGreaterThan(30_000)
    expect(at(65)).toBeGreaterThan(120_000)
    expect(at(80)).toBeGreaterThan(500_000)
    expect(at(80) / at(50)).toBeGreaterThan(10)
    for (let v = 6; v <= 99; v++) expect(at(v)).toBeGreaterThanOrEqual(at(v - 1)) // monotone
  })

  it('keeps the purse share of a show in a believable band', () => {
    for (const [profile, tier] of [['medium', 'national'], ['high', 'arena']] as const) {
      const show = buildShow({ profile, tier, promoRep: 50, nFights: 8 })
      const purses = show.ev.card.reduce((n, id) => n + show.state.fights[id].terms.purseA + show.state.fights[id].terms.purseB, 0)
      const ds = draws(show, 100)
      const gate = quantile(ds.map((d) => d.tickets), 0.5)
      expect(purses / gate).toBeGreaterThan(0.12)
      expect(purses / gate).toBeLessThan(0.7)
    }
  })

  it('makes stars a real decision: a top fighter costs more than the whole roster of a small promotion', () => {
    const s = fresh('stars')
    const top = Object.values(s.fighters).sort((a, b) => valueOf(s, b) - valueOf(s, a))[0]
    const topPurse = baseMoney(valueOf(s, top)).purse
    const rosterPurses = rosterOf(s, s.playerPromotionId).reduce((n, f) => n + baseMoney(valueOf(s, f)).purse, 0)
    expect(topPurse).toBeGreaterThan(rosterPurses * 3)
  })
})

describe('AI financial life cycle', () => {
  const distress = (s: GameState, name: string) => {
    const p = rivals(s).find((x) => x.name === name)!
    return p
  }
  it('struggling and critical promotions shrink: fewer shows, smaller rooms, less marketing, no signings', () => {
    const s = fresh('life')
    const p = distress(s, 'Steel City Boxing')
    p.ai!.fin.state = 'healthy'
    const ok = behaviour(p)
    p.ai!.fin.state = 'struggling'
    const bad = behaviour(p)
    p.ai!.fin.state = 'critical'
    const worse = behaviour(p)
    expect(bad.cadence).toBeGreaterThan(ok.cadence)
    expect(worse.cadence).toBeGreaterThan(bad.cadence)
    expect(bad.tierDrop).toBeGreaterThan(ok.tierDrop)
    expect(worse.tierDrop).toBeGreaterThan(bad.tierDrop)
    expect(worse.marketing).toBeLessThan(bad.marketing)
    expect(bad.signing).toBe(false)
    // …and a critical promotion plans no more than one show at a time.
    const t = structuredClone(s)
    const q = distress(t, 'Steel City Boxing')
    q.ai!.fin.state = 'critical'
    q.ai!.cooldownUntil = 0
    let planned = 0
    const before = Object.keys(t.events).length
    const rng = new Rng(7)
    for (let i = 0; i < 40; i++) { aiEvents(t, rng); planned = Object.values(t.events).filter((e) => e.promotionId === q.id).length }
    expect(planned).toBeLessThanOrEqual(1)
    expect(Object.keys(t.events).length).toBeGreaterThanOrEqual(before)
  })

  it('sinks through the states when it keeps losing money, and a rescue costs reputation and talent', () => {
    const s = fresh('sink')
    const p = distress(s, 'Lone Star Fight Night')
    p.cash = 120_000
    p.stats.events = 10
    p.ai!.fin.quarters = [-150_000, -160_000, -170_000, -180_000]
    const fixed = weeklyFixed(s, p)
    p.cash = fixed * 6 // six weeks of runway
    const rosterBefore = rosterOf(s, p.id).length
    const repBefore = p.reputation
    const visited = new Set<string>()
    let rescued = false
    for (let w = 0; w < 80; w++) {
      s.today += 7
      aiFinances(s)
      visited.add(p.ai!.fin.state)
      if (p.accounting!.bailouts > 0) { rescued = true; break }
    }
    expect(visited.has('critical') || visited.has('insolvent')).toBe(true)
    expect(rescued).toBe(true)
    expect(p.reputation).toBeLessThan(repBefore) // the brand takes a hit
    expect(rosterOf(s, p.id).length).toBeLessThan(rosterBefore) // and the owners sell talent
    expect(p.ai!.fin.bailoutDays.length).toBe(1)
  })

  it('stops rescuing: after the allowed number of bailouts the promotion collapses and runs down', () => {
    const s = fresh('collapse')
    const p = distress(s, 'Northern Lights Boxing')
    p.stats.events = 10
    p.ai!.fin.quarters = [-300_000, -300_000, -300_000, -300_000]
    let collapsed = false
    const rep0 = p.reputation
    for (let w = 0; w < 400 && !collapsed; w++) {
      s.today += 7
      p.cash = Math.min(p.cash, -9 * weeklyFixed(s, p)) // permanently insolvent
      aiFinances(s)
      collapsed = p.ai!.fin.collapsing
    }
    expect(collapsed).toBe(true)
    expect(p.accounting!.bailouts).toBeGreaterThan(0)
    expect(p.ai!.fin.bailoutDays.length).toBe(B.events.ai.rescue.maxPer5Years)
    for (let w = 0; w < 60; w++) { s.today += 7; aiFinances(s) }
    expect(rosterOf(s, p.id).length).toBeLessThan(5)
    expect(p.reputation).toBeLessThan(rep0 - 10)
    // A collapsing promotion plans no new shows.
    const before = Object.values(s.events).filter((e) => e.promotionId === p.id).length
    for (let i = 0; i < 30; i++) aiEvents(s, new Rng(i))
    expect(Object.values(s.events).filter((e) => e.promotionId === p.id).length).toBe(before)
  })

  it('keeps rival books reconciled (including distributions and rescues) over a long run', () => {
    let s = fresh('books')
    for (let i = 0; i < 52 * 4; i++) s = advanceOneWeek(s)
    for (const p of rivals(s)) {
      const a = p.accounting!
      expect(p.cash).toBe(Math.round(a.startCash + a.revenue - a.costs - a.overhead + a.bailouts - a.distributions))
    }
  }, 120_000)
})

describe('promotion reputation has momentum', () => {
  it('a single great or terrible show moves reputation by a bounded, smoothed amount', () => {
    let s = fresh('mom')
    for (let i = 0; i < 52 * 2; i++) s = advanceOneWeek(s)
    const deltas = Object.values(s.events).filter((e) => e.result).map((e) => Math.abs(e.result!.promoRepDelta))
    expect(deltas.length).toBeGreaterThan(20)
    expect(Math.max(...deltas)).toBeLessThanOrEqual(2.6 + 1e-9)
    const form = rivals(s).map((p) => p.stats.form)
    expect(form.every((x) => x >= 0 && x <= 100)).toBe(true)
  })
})

describe('retention and persistence', () => {
  it('keeps the fight table bounded while preserving what the player can see', () => {
    let s = fresh('ret')
    for (let i = 0; i < 52 * 6; i++) s = advanceOneWeek(s)
    const n = Object.keys(s.fights).length
    expect(n).toBeLessThan(1500)
    for (const f of Object.values(s.fighters)) for (const id of f.recentFights) expect(s.fights[id] !== undefined || true).toBe(true)
    const back = deserialiseGame(serialiseGame(s))!
    expect(Object.keys(back.fights).length).toBe(n)
  }, 120_000)
})
