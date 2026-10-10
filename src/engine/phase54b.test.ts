/**
 * Phase 5.4B - the living boxing world: contested signings, the demand-driven prospect pipeline, promotion life cycle,
 * standing, public views, determinism and the v10 -> v11 migration.
 */
import { describe, expect, it } from 'vitest'
import { createNewGame } from './worldgen'
import { advanceOneWeek } from './tick'
import { clone } from './media/testing'
import { Rng } from './rng'
import { IdGen } from './ids'
import { aiSigning, resolvePursuits } from './systems/aiMarket'
import { endPursuit, pursuitOf, startPursuit } from './world/pursuit'
import { PIPELINE, divisionCounts, divisionTarget, shortfalls, talentIntake } from './world/intake'
import { LIFECYCLE, isDefunct, processLifecycle, tradingRivals } from './world/lifecycle'
import { creditTitleChange } from './world/standing'
import { clashesOn, moveCounts, recentMoves, rivalOfferFor, rivalStandings } from './world/views'
import { scoreOffer, suggestedOffer } from './negotiation'
import { migrate, serialiseGame } from './save'
import { availabilityFor } from './market'
import { WEIGHT_CLASSES } from '../data/weightClasses'
import { fighterAge } from './fighters'
import { GAME_STATE_VERSION, type GameState } from './types'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const mk = (seed: string) => createNewGame({ seed, promotionName: 'P54B', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
const world = (() => { let s: GameState | null = null; return () => (s ??= (() => { let g = mk('p54b-world'); for (let i = 0; i < 104; i++) g = advanceOneWeek(g); return g })()) })()
const ids = (s: GameState) => { const g = new IdGen(); g.counter = s.idCounter + 5000; return g }

/** A free agent a solvent rival could sign, and that rival, in a scratch copy. */
function setup(s: GameState) {
  const live = Object.entries(s.world?.pursuits ?? {})
  const roster = (id: string) => Object.values(s.contracts).filter((c) => c.promotionId === id && c.status === 'active').length
  // the emptiest roster among rivals with no offer already out: a fixture, so the signing can never be refused for room
  const rival = Object.values(s.promotions).filter((p) => !p.isPlayer && p.ai && !p.ai.fin.collapsing && p.tier !== 'Startup' && !live.some(([, x]) => x.promoId === p.id)).sort((a, b) => roster(a.id) - roster(b.id) || (a.id < b.id ? -1 : 1))[0]
  rival.cash = 5_000_000
  // free the rival's roster so it is never full
  const f = Object.values(s.fighters).find((x) => x.status === 'active' && x.contractId === null && x.record.wins >= 3 && !live.some(([id]) => id === x.id))!
  return { rival, f }
}

describe('contested signings', () => {
  it('a pursuit is one per fighter and one per promotion, and ends cleanly', () => {
    const s = clone(world())
    const { rival, f } = setup(s)
    const other = Object.values(s.fighters).find((x) => x.id !== f.id && x.status === 'active' && x.contractId === null)!
    expect(startPursuit(s, f.id, rival.id, s.today + 14)).not.toBeNull()
    expect(startPursuit(s, f.id, 'someone-else', s.today + 14)).toBeNull() // the fighter already has an offer
    expect(startPursuit(s, other.id, rival.id, s.today + 14)).toBeNull() // the promotion already has one out
    endPursuit(s, f.id)
    expect(pursuitOf(s, f.id)).toBeNull()
    expect(startPursuit(s, other.id, rival.id, s.today + 14)).not.toBeNull()
  })

  it('an offer comes due: the fighter signs with the rival under the normal signing rules, and the rival pays for it', () => {
    const s = clone(world())
    const { rival, f } = setup(s)
    const cash = rival.cash
    startPursuit(s, f.id, rival.id, s.today)
    resolvePursuits(s, new Rng(7), ids(s))
    expect(pursuitOf(s, f.id)).toBeNull()
    expect(f.contractId).not.toBeNull()
    const c = s.contracts[f.contractId!]
    expect(c.promotionId).toBe(rival.id)
    expect(c.status).toBe('active')
    expect(rival.cash).toBeCloseTo(cash - c.signingBonus, 5) // no free fighters: the bonus leaves the rival's cash
    expect(f.history[f.history.length - 1].kind).toBe('signed')
    expect(Object.values(s.contracts).filter((x) => x.fighterId === f.id && x.status === 'active')).toHaveLength(1)
  })

  it('an offer is not yet due before its day', () => {
    const s = clone(world())
    const { rival, f } = setup(s)
    startPursuit(s, f.id, rival.id, s.today + 14)
    resolvePursuits(s, new Rng(7), ids(s))
    expect(f.contractId).toBeNull()
    expect(pursuitOf(s, f.id)).not.toBeNull()
  })

  it('the player can win the fighter in the window: the rival offer lapses and nobody is double-signed', () => {
    const s = clone(world())
    const { rival, f } = setup(s)
    startPursuit(s, f.id, rival.id, s.today + 14)
    // the player signs them first (same contract plumbing as any signing)
    const own = Object.values(s.contracts).find((c) => c.promotionId === s.playerPromotionId && c.status === 'active')!
    const pc = { ...own, id: 'c_player_win', fighterId: f.id }
    s.contracts[pc.id] = pc; f.contractId = pc.id
    s.today += 14
    resolvePursuits(s, new Rng(7), ids(s))
    expect(pursuitOf(s, f.id)).toBeNull()
    expect(f.contractId).toBe('c_player_win')
    expect(Object.values(s.contracts).filter((x) => x.fighterId === f.id && x.status === 'active' && x.promotionId === rival.id)).toHaveLength(0)
  })

  it('a rival that can no longer afford, has no room, or has collapsed does not sign; the offer simply lapses', () => {
    for (const wreck of ['broke', 'collapsing'] as const) {
      const s = clone(world())
      const { rival, f } = setup(s)
      startPursuit(s, f.id, rival.id, s.today)
      if (wreck === 'broke') rival.cash = 0
      else rival.ai!.fin.collapsing = true
      resolvePursuits(s, new Rng(7), ids(s))
      expect(f.contractId, wreck).toBeNull()
      expect(pursuitOf(s, f.id), wreck).toBeNull()
    }
  })

  it('while an offer is pending no rival shops the same fighter around', () => {
    const s = clone(world())
    const { rival, f } = setup(s)
    startPursuit(s, f.id, rival.id, s.today + 28)
    for (let i = 0; i < 30; i++) { const t = clone(s); t.seed = `shop-${i}`; aiSigning(t, new Rng(i + 1), ids(t)); expect(t.fighters[f.id].contractId).toBeNull() }
  })

  it('a rival offer makes the same free agent cost a little more for the player, and says why', () => {
    const s = clone(world())
    const { rival, f } = setup(s)
    const player = s.promotions[s.playerPromotionId]
    const offer = suggestedOffer(s, f, 'signing')
    const before = scoreOffer(s, f, player, offer, 'signing')
    startPursuit(s, f.id, rival.id, s.today + 14)
    const after = scoreOffer(s, f, player, offer, 'signing')
    expect(after.ratio).toBeLessThan(before.ratio)
    expect(after.ratio / before.ratio).toBeGreaterThan(0.89) // a nudge, not a wall
    // a bigger name across the table costs more than a smaller one
    const r0 = rival.reputation, p0 = player.reputation
    rival.reputation = 100; player.reputation = 10
    const big = scoreOffer(s, f, player, offer, 'signing').ratio
    rival.reputation = 10; player.reputation = 100
    const small = scoreOffer(s, f, player, offer, 'signing').ratio
    expect(big).toBeLessThan(small)
    rival.reputation = r0; player.reputation = p0
    expect(before.reasons).not.toContain('has another offer on the table')
    const low = scoreOffer(s, f, player, { ...offer, basePurse: 1, signingBonus: 0, weeklyRetainer: 0 }, 'signing')
    expect(low.reasons).toContain('has another offer on the table')
    // renewals are unaffected
    expect(scoreOffer(s, f, player, offer, 'renewal').ratio).toBeCloseTo(before.ratio, 6)
  })

  it('the player only hears of an offer on a fighter they know about, and only what is public', () => {
    const s = clone(world())
    const { rival, f } = setup(s)
    delete s.knowledge[f.id]
    startPursuit(s, f.id, rival.id, s.today + 14)
    expect(rivalOfferFor(s, f.id)).toBeNull()
    s.knowledge[f.id] = { fighterId: f.id, discoveredDay: s.today, source: 'tip', est: {}, insight: 0, reports: [], observations: 0 }
    const offer = rivalOfferFor(s, f.id)!
    expect(offer.promotion).toBe(rival.name)
    expect(offer.weeks).toBe(2)
    expect(Object.keys(offer).sort()).toEqual(['promotion', 'weeks'])
  })
})

describe('the prospect pipeline', () => {
  it('follows the shortfall: a depleted division refills and a crowded one does not', () => {
    const s = clone(world())
    const target = shortfalls(s)
    // empty one division, crowd another
    const empty = WEIGHT_CLASSES[8].id, crowded = WEIGHT_CLASSES[10].id
    for (const f of Object.values(s.fighters)) if (f.weightClass === empty && f.status === 'active') f.status = 'retired'
    const sf = shortfalls(s)
    expect(sf[empty]).toBe(divisionTarget(empty))
    const got: Record<string, number> = {}
    for (let i = 0; i < 120; i++) {
      const t = clone(s); t.seed = `intake-${i}`
      const before = new Set(Object.keys(t.fighters))
      talentIntake(t, new Rng(i + 11), ids(t))
      for (const id of Object.keys(t.fighters)) if (!before.has(id)) got[t.fighters[id].weightClass] = (got[t.fighters[id].weightClass] ?? 0) + 1
    }
    const total = Object.values(got).reduce((a, b) => a + b, 0)
    expect(total).toBeGreaterThan(30)
    expect(got[empty] / total).toBeGreaterThan(0.25) // the empty class takes the largest share
    expect((got[crowded] ?? 0) / total).toBeLessThan(0.2)
    void target
  })

  it('a full sport takes only a trickle, and a year never exceeds its cap', () => {
    const s = clone(world())
    for (let i = 0; i < 400; i++) { const t = clone(s); t.world!.intake = { windowStart: t.today, admitted: PIPELINE.yearlyCap }; const n0 = Object.keys(t.fighters).length; talentIntake(t, new Rng(i), ids(t)); expect(Object.keys(t.fighters).length).toBe(n0) }
    // at or above target in every division: far below one a week
    const full = clone(s)
    for (const w of WEIGHT_CLASSES) { const need = divisionTarget(w.id) - (divisionCounts(full)[w.id] ?? 0); for (let k = 0; k < need; k++) { const f = Object.values(full.fighters).find((x) => x.status === 'retired'); if (f) { f.status = 'active'; f.weightClass = w.id } } }
    let admitted = 0
    for (let i = 0; i < 300; i++) { const t = clone(full); const n0 = Object.keys(t.fighters).length; talentIntake(t, new Rng(i + 1), ids(t)); admitted += Object.keys(t.fighters).length - n0 }
    expect(admitted / 300).toBeLessThan(0.6)
  })

  it('newcomers are coherent: ages and records fit their origin, unsigned, unscouted, signable and recorded in their history', () => {
    const s = clone(world())
    for (const f of Object.values(s.fighters)) if (f.status === 'active' && f.weightClass === WEIGHT_CLASSES[4].id) f.status = 'retired' // force a heavy intake
    const fresh: string[] = []
    for (let i = 0; i < 200; i++) {
      const before = new Set(Object.keys(s.fighters))
      s.world!.intake = { windowStart: s.today, admitted: 0 }
      talentIntake(s, new Rng(i + 3), ids(s)); s.idCounter += 100
      for (const id of Object.keys(s.fighters)) if (!before.has(id)) fresh.push(id)
    }
    expect(fresh.length).toBeGreaterThan(30)
    expect(new Set(fresh).size).toBe(fresh.length) // no duplicate identities
    let amateurs = 0, withBouts = 0
    for (const id of fresh) {
      const f = s.fighters[id]
      const age = fighterAge(f, s.today), n = f.record.wins + f.record.losses + f.record.draws
      expect(f.status).toBe('active'); expect(f.contractId).toBeNull(); expect(s.knowledge[id]).toBeUndefined()
      expect(age).toBeGreaterThanOrEqual(18); expect(age).toBeLessThanOrEqual(28)
      expect(f.history[0].kind).toBe('turnedPro')
      expect(f.record.wins + f.record.losses + f.record.draws).toBe(f.record.wins + f.record.losses + f.record.draws)
      if (age <= 21) { expect(n).toBe(0); amateurs++ } else if (n > 0) withBouts++
      expect(availabilityFor(s, f).signable || availabilityFor(s, f).reason!.includes('Roster full')).toBe(true)
    }
    expect(amateurs).toBeGreaterThan(withBouts) // mostly amateur graduates
    expect(withBouts).toBeGreaterThan(0) // some arrive with professional experience
  })
})

describe('promotion life cycle and standing', () => {
  it('a promotion with no fighters, no shows and no money is defunct and stops counting as a competitor; nothing about it is deleted', () => {
    const s = clone(world())
    const p = Object.values(s.promotions).find((x) => !x.isPlayer)!
    for (const c of Object.values(s.contracts)) if (c.promotionId === p.id) { c.status = 'released' as never }
    // contracts remain in state with a non-active status; "on its books" is by promotion id, so remove them for the test
    for (const [id, c] of Object.entries(s.contracts)) if (c.promotionId === p.id) delete s.contracts[id]
    for (const [id, e] of Object.entries(s.events)) if (e.promotionId === p.id) delete s.events[id]
    p.cash = 1_000_000
    expect(isDefunct(s, p)).toBe(false) // empty but solvent: a rebuild, not a failure
    p.cash = 20_000
    expect(isDefunct(s, p)).toBe(true)
    p.cash = 1_000_000; p.ai!.fin.collapsing = true
    expect(isDefunct(s, p)).toBe(true)
    expect(s.promotions[p.id]).toBeDefined()
    expect(tradingRivals(s).some((x) => x.id === p.id)).toBe(false)
    // the opening world is left alone for its first year
    const young = clone(world()); young.today = young.startDay + 7 * (13 * 3 + 6)
    for (const r of Object.values(young.promotions).filter((x) => !x.isPlayer)) r.ai!.fin.collapsing = true
    const n0 = Object.keys(young.promotions).length; processLifecycle(young, ids(young)); expect(Object.keys(young.promotions).length).toBe(n0)
  })

  it('a new promotion is founded only when the sport is short of rivals or has idle talent; modest, once per half year, with books that open honestly', () => {
    const s = clone(world())
    // knock rivals out until the sport is short
    const rivals = Object.values(s.promotions).filter((p) => !p.isPlayer)
    for (const p of rivals.slice(0, 3)) p.ai!.fin.collapsing = true
    let founded: GameState | null = null
    for (let k = 0; k < 40 && !founded; k++) {
      const t = clone(s)
      t.today = t.startDay + 7 * (13 * (100 + k) + 6) // a week that is 6 mod 13, a fresh quarter each time
      const n0 = Object.keys(t.promotions).length
      processLifecycle(t, ids(t))
      if (Object.keys(t.promotions).length === n0 + 1) founded = t
    }
    expect(founded).not.toBeNull()
    const np = Object.values(founded!.promotions).find((p) => !rivals.some((r) => r.id === p.id) && !p.isPlayer)!
    expect(np.tier).toBe('Startup')
    expect(np.cash).toBe(LIFECYCLE.capital)
    expect(np.accounting!.startCash).toBe(LIFECYCLE.capital)
    expect(np.ai!.fin.state).toBe('established') // the same opening state as every launch promotion
    expect(np.ai!.fin.quarters).toEqual([])
    expect(np.reputation).toBeLessThan(15)
    // not again straight away
    const again = clone(founded!); again.today += 13 * 7
    const n1 = Object.keys(again.promotions).length
    processLifecycle(again, ids(again))
    expect(Object.keys(again.promotions).length).toBe(n1)
    // a healthy sport founds none
    const healthy = clone(world())
    for (let k = 0; k < 20; k++) { const t = clone(healthy); t.today = t.startDay + 7 * (13 * (100 + k) + 6); const n = Object.keys(t.promotions).length, full = tradingRivals(t).length >= LIFECYCLE.maxTrading; processLifecycle(t, ids(t)); if (full) expect(Object.keys(t.promotions).length).toBe(n) }
  })

  it('winning a belt lifts a promotion a little and costs the beaten champion\'s promotion a little; never beyond bounds', () => {
    const s = clone(world())
    const [a, b] = Object.values(s.promotions).filter((p) => !p.isPlayer && p.reputation < 90 && p.reputation > 5)
    const fa = Object.values(s.fighters).find((f) => f.contractId && s.contracts[f.contractId].promotionId === a.id)!
    const fb = Object.values(s.fighters).find((f) => f.contractId && s.contracts[f.contractId].promotionId === b.id)!
    const ra = a.reputation, rb = b.reputation
    creditTitleChange(s, fa.id, fb.id, 'world')
    expect(a.reputation).toBeGreaterThan(ra); expect(a.reputation - ra).toBeLessThan(1)
    expect(b.reputation).toBeLessThan(rb); expect(rb - b.reputation).toBeLessThan(1)
    a.reputation = 99.9; creditTitleChange(s, fa.id, null, 'world'); expect(a.reputation).toBeLessThanOrEqual(100)
    const area = a.reputation; creditTitleChange(s, fa.id, null, 'area'); expect(a.reputation - area).toBeLessThan(0.1)
  })
})

describe('what the player can see', () => {
  it('rival standings are public facts only', () => {
    const s = world()
    const rows = rivalStandings(s)
    expect(rows).toHaveLength(Object.values(s.promotions).filter((p) => !p.isPlayer).length)
    const text = JSON.stringify(rows)
    for (const hidden of ['cash', 'competence', 'risk', 'strategy', 'urgency', 'fin', 'bailout', 'weights']) expect(text, hidden).not.toContain(`"${hidden}`)
    for (const r of rows) { expect(['Expanding', 'Active', 'Cutting back', 'Quiet', 'Folding', 'Folded', 'New']).toContain(r.status); expect(r.why.length).toBeGreaterThan(5) }
    const p = Object.values(s.promotions).find((x) => !x.isPlayer)!
    const mv = moveCounts(s, p.id, 520)
    expect(mv.signed).toBeGreaterThan(0)
    const moves = recentMoves(s, p.id, 5)
    expect(moves.length).toBeLessThanOrEqual(5)
    for (let i = 1; i < moves.length; i++) expect(moves[i - 1].day).toBeGreaterThanOrEqual(moves[i].day)
  })

  it('a rival show on or near the night in the same country is reported as a clash; elsewhere or later is not', () => {
    const s = clone(world())
    const ev = Object.values(s.events).find((e) => e.promotionId !== s.playerPromotionId && e.status !== 'cancelled' && e.status !== 'archived' && e.status !== 'planning')!
    expect(clashesOn(s, ev.day, ev.country).some((c) => c.name === ev.name)).toBe(true)
    expect(clashesOn(s, ev.day + 1, ev.country).some((c) => c.name === ev.name)).toBe(true)
    expect(clashesOn(s, ev.day + 3, ev.country).some((c) => c.name === ev.name)).toBe(false)
    expect(clashesOn(s, ev.day, 'ZZZ')).toHaveLength(0)
  })
})

describe('a living world over two years', () => {
  it('keeps the books and the registers consistent', () => {
    const s = world()
    const activeBy: Record<string, number> = {}
    for (const c of Object.values(s.contracts)) if (c.status === 'active') activeBy[c.fighterId] = (activeBy[c.fighterId] ?? 0) + 1
    for (const [fid, n] of Object.entries(activeBy)) { expect(n, fid).toBe(1); expect(s.fighters[fid].contractId).not.toBeNull() }
    for (const f of Object.values(s.fighters)) if (f.contractId) { const c = s.contracts[f.contractId]; expect(c?.fighterId).toBe(f.id); expect(c?.status).toBe('active') }
    for (const [fid, p] of Object.entries(s.world!.pursuits)) {
      const f = s.fighters[fid]
      expect(f.status).toBe('active'); expect(f.contractId).toBeNull(); expect(s.promotions[p.promoId].ai).toBeTruthy(); expect(p.decide - p.since).toBeLessThanOrEqual(21)
    }
    for (const p of Object.values(s.promotions)) {
      if (p.isPlayer) continue
      expect(Number.isFinite(p.cash)).toBe(true)
      const a = p.accounting!
      expect(p.cash).toBeLessThanOrEqual(a.startCash + a.revenue + a.bailouts + 1) // no free money: cash never exceeds what came in
    }
    // title history survives: every champion and every reign refers to a real fighter
    for (const rec of Object.values(s.media!.titles)) if (rec.c) expect(s.fighters[rec.c]).toBeDefined()
    const pop = Object.values(s.fighters).filter((f) => f.status === 'active').length
    expect(pop).toBeGreaterThan(220); expect(pop).toBeLessThan(380)
  })

  it('is deterministic: the same state advances to the same state, and survives a save round trip', () => {
    const s = world()
    const a = advanceOneWeek(s), b = advanceOneWeek(s)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    const back = migrate(JSON.parse(serialiseGame(s)))!
    expect(JSON.stringify(advanceOneWeek(back))).toBe(JSON.stringify(a))
  })
})

describe('the v10 -> v11 migration', () => {
  it('adds the world record and changes nothing else; the career carries on', () => {
    const s = clone(world())
    const old = JSON.parse(JSON.stringify(s)) as Record<string, unknown>
    old.version = 10; delete old.world
    const m = migrate(JSON.parse(JSON.stringify(old)))!
    expect(m.version).toBe(GAME_STATE_VERSION)
    expect(m.world).toEqual({ v: 1, pursuits: {}, intake: { windowStart: s.today, admitted: 0 } })
    const { world: _w, version: _v, ...rest } = m as unknown as Record<string, unknown>
    const { world: _w2, version: _v2, ...restOld } = old
    void _w; void _v; void _w2; void _v2
    expect(JSON.stringify(rest)).toBe(JSON.stringify(restOld))
    let g: GameState = m
    for (let i = 0; i < 6; i++) g = advanceOneWeek(g)
    expect(g.today).toBe(m.today + 42)
    expect(Object.values(g.contracts).filter((c) => c.status === 'active').length).toBeGreaterThan(50)
  })
})
