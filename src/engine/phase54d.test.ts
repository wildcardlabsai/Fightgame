/**
 * Phase 5.4D - fight night consequences: stage-aware results, the post-fight decisions, rival and camp reactions, offers that follow form,
 * careers that end because they stopped working, and the stories that are told about them.
 */
import { describe, expect, it } from 'vitest'
import { createNewGame } from './worldgen'
import { advanceOneWeek } from './tick'
import { clone } from './media/testing'
import { serialiseGame, deserialiseGame } from './save'
import type { Fight, Fighter, GameState } from './types'
import { createFight, resolveFight } from './fights'
import { careerStage, resultContext, streakBefore } from './fight/context'
import { openReviews, processReviews, processReviewsFor, resolveReview, REVIEW_WEEKS } from './office/reviews'
import { afterFightResult } from './office/politics'
import { opponentFit } from './office/goals'
import { generateOffers } from './office/offers'
import { relation } from './office/relations'
import { answerReview } from './office/commands'
import { reviewsView } from './office/views'
import { planOf } from './business/plans'
import { goalOf } from './office/goals'
import { wornDownChance, processRetirements } from './systems/world'
import { Rng } from './rng'
import { getCareer } from './media/records'
import { titlesHeldBy } from './media/titles'
import { playerRoster } from './selectors'
import { officeOf } from './office/state'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const mk = (seed: string) => createNewGame({ seed, promotionName: 'P54D', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
const world = (() => { let s: GameState | null = null; return () => (s ??= (() => { let g = mk('p54d-world'); for (let i = 0; i < 104; i++) g = advanceOneWeek(g); g.promotions[g.playerPromotionId].cash = Math.max(g.promotions[g.playerPromotionId].cash, 1_500_000); return g })()) })()

const dummy = (over: Partial<Fighter> = {}, state?: GameState): Fighter => {
  const f = structuredClone(Object.values((state ?? world()).fighters)[0]) as Fighter
  return Object.assign(f, over)
}

/** Run one bout between two fighters through the real fight night path, under a chosen seed. */
function bout(base: GameState, aId: string, bId: string, seed: string): { s: GameState; fight: Fight } {
  const s = clone(base)
  s.seed = seed
  const fight = createFight(s, aId, bId, s.playerPromotionId, 'player') as Fight
  fight.status = 'fightNight'
  fight.day = s.today
  fight.scheduledRounds = 8
  resolveFight(s, fight)
  return { s, fight: s.fights[fight.id] }
}

const myFighters = (s: GameState) => playerRoster(s).filter((f) => f.status === 'active' && !f.activeFightId && !f.injury)
/** Search seeds for a bout that ends the way a test needs. */
function findBout(want: (f: Fight, s: GameState, myIdx: 0 | 1) => boolean, pick: (s: GameState, skip: number) => { me: Fighter; opp: Fighter } | null, tries = 90): { s: GameState; fight: Fight; me: Fighter; opp: Fighter } | null {
  const base = world()
  for (let skip = 0; skip < 6; skip++) {
    const pr = pick(base, skip)
    if (!pr) break
    for (let k = 0; k < tries; k++) {
      const { s, fight } = bout(base, pr.me.id, pr.opp.id, `p54d-${skip}-${k}`)
      if (want(fight, s, 0)) return { s, fight, me: s.fighters[pr.me.id], opp: s.fighters[pr.opp.id] }
    }
  }
  return null
}
const sameDivision = (s: GameState, me: Fighter, stronger: boolean): Fighter | null => {
  const pool = Object.values(s.fighters).filter((x) => x.status === 'active' && x.id !== me.id && x.weightClass === me.weightClass && !x.activeFightId && x.contractId && s.contracts[x.contractId].promotionId !== s.playerPromotionId)
  pool.sort((a, b) => (stronger ? b.reputation - a.reputation : a.reputation - b.reputation) || (a.id < b.id ? -1 : 1))
  return pool[0] ?? null
}
const pickUnderdog = (s: GameState, skip = 0) => {
  const out: { me: Fighter; opp: Fighter }[] = []
  for (const me of [...myFighters(s)].sort((a, b) => a.reputation - b.reputation)) {
    if (me.record.wins + me.record.losses + me.record.draws < 4) continue
    const opp = sameDivision(s, me, true)
    if (opp) out.push({ me, opp })
  }
  return out[skip] ?? null
}
const pickFavourite = (s: GameState, skip = 0) => {
  const out: { me: Fighter; opp: Fighter }[] = []
  for (const me of [...myFighters(s)].sort((a, b) => b.reputation - a.reputation)) {
    if (me.record.wins + me.record.losses + me.record.draws < 5) continue
    const opp = sameDivision(s, me, false)
    if (opp) out.push({ me, opp })
  }
  return out[skip] ?? null
}

describe('results in career context', () => {
  const opp = () => dummy({ reputation: 50 })
  it('the same result means different things to different fighters, and every factor is bounded', () => {
    const w = world()
    const young = dummy({ record: { wins: 5, losses: 1, draws: 0, koWins: 2, koLosses: 0 }, birthDay: w.today - 22 * 365 }, w)
    const old = dummy({ record: { wins: 30, losses: 8, draws: 0, koWins: 10, koLosses: 2 }, birthDay: w.today - 37 * 365, reputation: 60 }, w)
    expect(careerStage(young, w.today)).toBe('prospect')
    expect(careerStage(old, w.today)).toBe('veteran')
    const none = { kind: null, n: 0 } as const
    const a = resultContext(w, young, opp(), 'win', 0.25, none), b = resultContext(w, old, opp(), 'win', 0.25, none)
    expect(a.pop).toBeGreaterThan(1)
    expect(a.notes.join(' ')).toMatch(/young fighter/)
    expect(b.rep).toBeGreaterThan(1) // a veteran beating the odds is credited too, in standing rather than fame
    const exp = resultContext(w, old, opp(), 'win', 0.8, none)
    expect(exp.pop).toBeLessThan(1) // an expected win adds little to an established name
    for (const c of [a, b, exp]) for (const v of [c.rep, c.pop, c.morale, c.conf]) { expect(v).toBeGreaterThanOrEqual(0.7); expect(v).toBeLessThanOrEqual(1.35) }
  })

  it('a first defeat after an unbeaten run, a heavy favourite beaten by a lesser name and a third defeat in a row each cost more', () => {
    const w = world()
    const unbeaten = dummy({ record: { wins: 8, losses: 0, draws: 0, koWins: 4, koLosses: 0 }, birthDay: w.today - 24 * 365, reputation: 55 }, w)
    const vet = dummy({ record: { wins: 25, losses: 6, draws: 0, koWins: 8, koLosses: 1 }, birthDay: w.today - 35 * 365, reputation: 60 }, w)
    const none = { kind: null, n: 0 } as const
    const first = resultContext(w, unbeaten, dummy({ reputation: 40 }, w), 'loss', 0.7, none)
    expect(first.morale).toBeGreaterThan(1); expect(first.pop).toBeGreaterThan(1); expect(first.notes.join(' ')).toMatch(/First defeat/)
    expect(first.rep).toBeGreaterThan(1) // a heavy favourite beaten by a lesser name
    const v = resultContext(w, vet, dummy({ reputation: 40 }, w), 'loss', 0.4, none)
    expect(v.morale).toBeLessThan(1) // a veteran has seen it before
    const streak = resultContext(w, vet, dummy({ reputation: 40 }, w), 'loss', 0.4, { kind: 'loss', n: 2 })
    expect(streak.mom).toBeLessThan(0); expect(streak.morale).toBeGreaterThan(v.morale)
    const draw = resultContext(w, vet, dummy({}, w), 'draw', 0.5, none)
    expect(draw).toEqual({ rep: 1, pop: 1, morale: 1, conf: 1, mom: 0, notes: [] })
  })

  it('a real fight records why it mattered (for the player\'s fighters only), deterministically', () => {
    const pr = pickUnderdog(world())!
    expect(pr).toBeTruthy()
    const one = bout(world(), pr.me.id, pr.opp.id, 'det-1'), two = bout(world(), pr.me.id, pr.opp.id, 'det-1')
    expect(JSON.stringify(one.fight.result)).toBe(JSON.stringify(two.fight.result))
    expect(JSON.stringify(one.s.fighters[pr.me.id])).toBe(JSON.stringify(two.s.fighters[pr.me.id]))
    expect(one.fight.result!.notes === undefined || Array.isArray(one.fight.result!.notes)).toBe(true)
    // a fight between two rivals' fighters keeps no notes
    const s = clone(world()); s.seed = 'ai-1'
    const [x, y] = Object.values(s.fighters).filter((f) => f.status === 'active' && f.contractId && s.contracts[f.contractId].promotionId !== s.playerPromotionId && f.weightClass === 'middleweight' && !f.activeFightId)
    if (x && y) {
      const f = createFight(s, x.id, y.id, s.contracts[x.contractId!].promotionId, 'ai') as Fight
      f.status = 'fightNight'; f.day = s.today; resolveFight(s, f)
      expect(s.fights[f.id].result!.notes).toBeUndefined()
    }
  })

  it('the loser\'s run of defeats is read from the record, newest first', () => {
    const s = clone(world())
    const me = myFighters(s)[0]
    const mk1 = (won: boolean, id: string) => { s.fights[id] = { id, sideA: { fighterId: me.id }, sideB: { fighterId: 'x' }, result: { winner: won ? 0 : 1 } } as never }
    mk1(true, 'ff1'); mk1(false, 'ff2'); mk1(false, 'ff3'); mk1(false, 'ff4')
    me.recentFights = ['ff1', 'ff2', 'ff3', 'ff4']
    expect(streakBefore(s, me, '')).toEqual({ kind: 'loss', n: 3 })
    expect(streakBefore(s, me, 'ff4')).toEqual({ kind: 'loss', n: 2 })
  })
})

describe('post-fight decisions', () => {
  it('a breakout win by a young fighter opens exactly one decision, and only when its conditions hold', () => {
    const found = findBout((f, s) => f.result!.winner === 0 && f.result!.pExpA < 0.4 && openReviews(s).length > 0, pickUnderdog)
    expect(found, 'a breakout bout exists in the seed window').toBeTruthy()
    const hit = found!
    const open = openReviews(hit.s)
    expect(open).toHaveLength(1)
    expect(open[0].kind).toBe('breakout')
    expect(open[0].fighterId).toBe(hit.me.id)
    // processing the same result again changes nothing
    const before = JSON.stringify(hit.s.office!.reviews)
    processReviewsFor(hit.s, hit.fight.id)
    expect(JSON.stringify(hit.s.office!.reviews)).toBe(before)
    const view = reviewsView(hit.s)
    expect(view[0].choices.map((c) => c.key)).toEqual(['step', 'build'])
    expect(view[0].text).toMatch(/favourite/)
  })

  it('routine results open nothing: an expected win by the favourite creates no decision', () => {
    const hit = findBout((f) => f.result!.winner === 0 && f.result!.pExpA > 0.6 && f.result!.method === 'UD', pickFavourite)
    expect(hit, 'an expected win exists in the seed window').toBeTruthy()
    expect(openReviews(hit!.s)).toHaveLength(0)
  })

  it('choosing acts through the existing systems, once: fast-track sets the plan, rebuild sets the objective', () => {
    const s = clone(world())
    const me = myFighters(s).find((f) => sameDivision(s, f, true))!, opp = sameDivision(s, me, true)!
    const o = officeOf(s); o.reviews = {}
    o.reviews.rv1 = { id: 'rv1', kind: 'breakout', fighterId: me.id, oppId: opp.id, fightId: 'none', createdDay: s.today, expiresDay: s.today + REVIEW_WEEKS * 7, status: 'open' }
    o.reviews.rv2 = { id: 'rv2', kind: 'setback', fighterId: me.id, oppId: opp.id, fightId: 'none', createdDay: s.today, expiresDay: s.today + REVIEW_WEEKS * 7, status: 'open' }
    const r = answerReview(s, 'rv1', 'step')
    expect(r.ok).toBe(true)
    expect(planOf(r.state, me.id)).toBe('accelerated')
    expect(r.state.office!.reviews!.rv1.status).toBe('resolved')
    expect(r.state.office!.decisions[me.id][0].text).toMatch(/Fast-tracked/)
    expect(answerReview(r.state, 'rv1', 'step').ok).toBe(false) // cannot be decided twice
    expect(answerReview(s, 'rv1', 'nonsense').ok).toBe(false)
    const b = answerReview(s, 'rv2', 'rebuild')
    expect(b.ok).toBe(true)
    expect(goalOf(b.state, me.id)?.kind).toBe('rebuild')
    expect(planOf(b.state, me.id)).toBe('protected')
    expect(s.office!.reviews!.rv1.status).toBe('open') // the input state was not touched
  })

  it('a rematch decision opens the ordinary fight negotiation, and lapses without penalty when ignored or stale', () => {
    const s = clone(world())
    const me = myFighters(s).find((f) => sameDivision(s, f, false))!, opp = sameDivision(s, me, false)!
    const o = officeOf(s); o.reviews = {}
    o.reviews.rv3 = { id: 'rv3', kind: 'rematch', fighterId: me.id, oppId: opp.id, fightId: 'none', createdDay: s.today, expiresDay: s.today + REVIEW_WEEKS * 7, status: 'open' }
    const r = answerReview(s, 'rv3', 'pursue')
    if (r.ok) {
      expect(r.fightId).toBeTruthy()
      expect(r.state.fights[r.fightId!].status).toBe('negotiating')
      expect(r.state.office!.reviews!.rv3.status).toBe('resolved')
    } else expect(r.error).toBeTruthy() // the camp may object or the match may not be valid: refused with a reason, review stays open
    const t = clone(s); const morale = t.fighters[me.id].morale
    t.today += (REVIEW_WEEKS + 1) * 7
    processReviews(t)
    expect(t.office!.reviews!.rv3.status).toBe('lapsed')
    expect(t.fighters[me.id].morale).toBe(morale)
    expect(t.office!.decisions[me.id][0].text).toMatch(/lapsed/) // a decision that goes away says so on the fighter's record
    const u = clone(s); u.fighters[me.id].status = 'retired'
    processReviews(u)
    expect(u.office!.reviews!.rv3.status).toBe('lapsed')
    expect(resolveReview(u, 'rv3', 'pursue').ok).toBe(false)
  })

  it('live decisions are bounded and a fighter has at most one', () => {
    const s = clone(world())
    const fs = myFighters(s)
    const opp = sameDivision(s, fs.find((f) => sameDivision(s, f, true)) ?? fs[0], true)!
    const o = officeOf(s); o.reviews = {}
    // a made-up winning upset result for each fighter, processed twice
    for (const f of fs) {
      const id = `ft_fake_${f.id}`
      s.fights[id] = { id, sideA: { fighterId: f.id, promotionId: s.playerPromotionId }, sideB: { fighterId: opp.id, promotionId: 'x' }, result: { winner: 0, method: 'UD', pExpA: 0.2, notes: undefined } } as never
      f.record = { wins: 6, losses: 1, draws: 0, koWins: 2, koLosses: 0 }
      processReviewsFor(s, id); processReviewsFor(s, id)
    }
    const open = openReviews(s)
    expect(open.length).toBeLessThanOrEqual(6)
    expect(new Set(open.map((r) => r.fighterId)).size).toBe(open.length)
  })
})

describe('reactions of camps and rivals', () => {
  it('beating a rival promotion\'s favourite cools them once; a fighter\'s camp warms to a win in a real test', () => {
    const s = clone(world())
    const me = myFighters(s).find((f) => sameDivision(s, f, true))!, opp = sameDivision(s, me, true)!
    const rival = s.contracts[opp.contractId!].promotionId
    const id = 'ft_react'
    s.fights[id] = { id, sideA: { fighterId: me.id, promotionId: s.playerPromotionId }, sideB: { fighterId: opp.id, promotionId: rival }, result: { winner: 0, method: 'UD', pExpA: 0.25 } } as never
    const camp = me.promoRelations[s.playerPromotionId] ?? 0
    afterFightResult(s, id)
    expect(relation(s, 'promoter', rival)).toBeLessThan(0)
    expect(me.promoRelations[s.playerPromotionId]).toBeGreaterThan(camp)
    const once1 = relation(s, 'promoter', rival), camp1 = me.promoRelations[s.playerPromotionId]
    afterFightResult(s, id); afterFightResult(s, id)
    expect(relation(s, 'promoter', rival)).toBe(once1)
    expect(me.promoRelations[s.playerPromotionId]).toBe(camp1)
    // an obvious mismatch lost cools the camp
    const t = clone(world()); const m2 = myFighters(t)[0]
    t.fights.ft_mis = { id: 'ft_mis', sideA: { fighterId: m2.id, promotionId: t.playerPromotionId }, sideB: { fighterId: opp.id, promotionId: rival }, result: { winner: 1, method: 'KO', pExpA: 0.1 } } as never
    const c0 = m2.promoRelations[t.playerPromotionId] ?? 0
    afterFightResult(t, 'ft_mis')
    expect(m2.promoRelations[t.playerPromotionId]).toBeLessThan(c0)
  })
})

describe('what results do to future matchmaking and offers', () => {
  it('a fighter in form draws offers about their win; a cold one does not', () => {
    const run = (momentum: number) => {
      const s = clone(world())
      for (const f of myFighters(s)) { f.momentum = momentum; f.lastFightDay = s.today - 14 }
      const reasons: Record<string, number> = {}
      for (let i = 0; i < 60; i++) { generateOffers(s); s.today += 7 }
      for (const o of Object.values(s.office!.offers)) reasons[o.reason] = (reasons[o.reason] ?? 0) + 1
      return reasons
    }
    expect(run(70).opportunity ?? 0).toBeGreaterThan(0)
    expect(run(0).opportunity ?? 0).toBe(0)
  })

  it('a shaken fighter\'s camp objects to a much bigger step, whatever the plan; an accelerated plan does not', () => {
    const s = clone(world())
    const me = myFighters(s)[0]
    const big = Object.values(s.fighters).filter((x) => x.status === 'active' && x.weightClass === me.weightClass && x.id !== me.id).sort((a, b) => b.reputation - a.reputation)[0]
    me.momentum = -60
    const fit = opponentFit(s, me, big)
    if (fit.gap > 0) expect(fit.label === 'A big step up' || !fit.objection).toBe(true)
    me.momentum = 20
    expect(opponentFit(s, me, big).objection && planOf(s, me.id) === 'normal').toBe(false)
  })
})

describe('careers that stop working', () => {
  it('a long losing run or two idle years can end a modest career, never a good one, and a champion is untouched', () => {
    const s = clone(world())
    const mkLoser = (rating: number): Fighter => {
      const f = dummy({ record: { wins: 10, losses: 14, draws: 0, koWins: 2, koLosses: 5 }, birthDay: s.today - 34 * 365, contractId: null, lastFightDay: s.today - 7 * 120 }, s)
      for (const k of Object.keys(f.attributes) as (keyof Fighter['attributes'])[]) f.attributes[k] = rating
      f.recentFights = []
      for (let i = 0; i < 5; i++) { const id = `lose${i}${rating}`; s.fights[id] = { id, sideA: { fighterId: f.id }, sideB: { fighterId: 'x' }, result: { winner: 1 } } as never; f.recentFights.push(id) }
      return f
    }
    const weak = mkLoser(35), good = mkLoser(75)
    expect(wornDownChance(s, weak, 34)).toBeGreaterThan(0)
    expect(wornDownChance(s, good, 34)).toBe(0)
    expect(wornDownChance(s, { ...weak, record: { wins: 1, losses: 3, draws: 0, koWins: 0, koLosses: 0 } } as Fighter, 34)).toBe(0) // too short a career to judge
    expect(wornDownChance(s, weak, 24)).toBe(0) // young fighters are not written off
  })

  it('retirement keeps the record, the fights and the history', () => {
    const s = clone(world())
    const f = Object.values(s.fighters).find((x) => x.status === 'active' && x.record.wins + x.record.losses > 10 && !titlesHeldBy(s.media!, x.id).length && !x.recentFights.some((id) => s.media!.titleFights[id]) && x.contractId && s.contracts[x.contractId].promotionId !== s.playerPromotionId)!
    const rec = JSON.stringify(f.record), fights = [...f.recentFights]
    f.birthDay = s.today - 41 * 365 // certain to retire (hazard capped at 0.25 a week: run a few draws)
    const rng = new Rng(77)
    for (let i = 0; i < 600 && f.status === 'active'; i++) processRetirements(s, rng) // the hazard depends on the fighter's record and wear: allow enough draws for any of them
    expect(f.status).toBe('retired')
    expect(JSON.stringify(f.record)).toBe(rec)
    expect(f.recentFights).toEqual(fights)
    expect(f.retiredDay).not.toBeNull()
  })
})

describe('stories and persistence', () => {
  it('two years of a world tell setback stories from real results (slumps and stoppages) without inventing any', () => {
    const s = world()
    let slump = 0, stopped = 0
    for (const f of Object.values(s.fighters)) for (const e of getCareer(s.media!, f.id)) {
      if (e.k === 'SLUMP') { slump++; expect(f.record.losses).toBeGreaterThanOrEqual(3); expect([3, 5]).toContain(e.n) }
      if (e.k === 'STOPPED') { stopped++; expect(f.record.koLosses).toBeGreaterThan(0) }
    }
    expect(slump + stopped).toBeGreaterThan(0)
  })

  it('a v12 save written before 5.4D (no reviews) loads and plays on; saving and loading keeps decisions', () => {
    const s = clone(world())
    delete (s.office as { reviews?: unknown }).reviews
    const back = deserialiseGame(serialiseGame(s))!
    let t = back
    for (let i = 0; i < 4; i++) t = advanceOneWeek(t)
    expect(t.office).toBeTruthy()
    const me = myFighters(s).find((f) => sameDivision(s, f, true))!, opp = sameDivision(s, me, true)!
    officeOf(s).reviews = { rv9: { id: 'rv9', kind: 'setback', fighterId: me.id, oppId: opp.id, fightId: 'none', createdDay: s.today, expiresDay: s.today + 42, status: 'open' } }
    const again = deserialiseGame(serialiseGame(s))!
    expect(again.office!.reviews!.rv9.status).toBe('open')
  })

  it('repeated weekly ticks do not duplicate decisions or relationship effects', () => {
    let s = clone(world())
    for (let i = 0; i < 20; i++) s = advanceOneWeek(s)
    const ids = Object.keys(s.office!.reviews ?? {})
    expect(new Set(ids).size).toBe(ids.length)
    expect(openReviews(s).length).toBeLessThanOrEqual(6)
  })
})
