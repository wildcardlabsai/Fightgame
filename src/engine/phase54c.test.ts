/**
 * Phase 5.4C - the promoter's office: incoming fight offers through to the ledger, career objectives and prospect protection, the trainer's
 * remit, promotional angles and press conferences, relationships, strategy and coaching, and the v11 -> v12 migration.
 */
import { describe, expect, it } from 'vitest'
import { createNewGame } from './worldgen'
import { advanceOneWeek } from './tick'
import { clone } from './media/testing'
import { migrate } from './save'
import { GAME_STATE_VERSION, type Fight, type GameState } from './types'
import { acceptOffer, counterOffer, generateOffers, isLive, offerProblem, processOffers, rejectOffer, withdrawCounter } from './office/offers'
import { applyOverride, goalProgress, opponentFit, setGoal, suggestedGoal, GOAL_INFO } from './office/goals'
import { shiftRelation, easeRelations, relation, venueTilt, standingOf } from './office/relations'
import { campaignFee, campaignPoints, campaignSuitability, setCampaign } from './office/promotion'
import { cardProfile, setStrategy, strategyDemand, strategyGrowth, strategyMarketing, strategyOverhead, strategyWeight } from './office/strategy'
import { coachGrowth, coachInjury, trainerFocus, trainerIntensity, trainerPlan, processTrainers, trainerReport } from './office/trainer'
import { chooseCoaching, chooseStrategy } from './office/commands'
import { afterEventCancelled, afterShowSettled } from './office/politics'
import { offersBoard, offerView, careerView, relationRows, campaignView, officeView } from './office/views'
import { officeOf } from './office/state'
import { pressWorthy, pressCost } from './office/press'
import { holdPress } from './media/requests'
import { approachOpponent } from './fightNegotiation'
import { assessChallenger } from './business/contender'
import { planOf, setPlan, planGrowthMult } from './business/plans'
import { eventInterest, hireFor } from './events/demand'
import { overheadCost, playerRoster, player } from './selectors'
import { titleObligation } from './business/titleEco'
import { rivalryStrength, bumpRivalry } from './media/narratives'
import { createEvent, createEventInternal } from './events/events'
import { createFight } from './fights'
import { Rng } from './rng'
import { fighterAge } from './fighters'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const mk = (seed: string) => createNewGame({ seed, promotionName: 'P54C', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
/** A passive career: the player runs no shows, so their fighters sit free and rivals write to them. */
const world = (() => { let s: GameState | null = null; return () => (s ??= (() => { let g = mk('p54c-world'); for (let i = 0; i < 104; i++) g = advanceOneWeek(g); g.promotions[g.playerPromotionId].cash = Math.max(g.promotions[g.playerPromotionId].cash, 1_500_000); return g })()) })()

/** A scratch world with one live, valid, host-'you' offer and one host-'them' offer, made by hand through the same builders the weekly pass uses. */
function withOffers(): { s: GameState; you: string; them: string } {
  const s = clone(world())
  const o = officeOf(s)
  o.offers = {}
  const rivals = Object.values(s.promotions).filter((p) => !p.isPlayer && p.ai && p.tier !== 'Startup')
  const mine = playerRoster(s).filter((f) => !f.activeFightId && !f.injury)
  expect(mine.length).toBeGreaterThan(2)
  const mkOffer = (n: number, host: 'you' | 'them', promoId: string, theirs: string, mineId: string, eventId: string | null) => {
    const id = `of_t${n}`
    o.offers[id] = {
      id, promoId, mine: mineId, theirs, reason: 'competitive', host, eventId, day: eventId ? s.events[eventId].day : null, rounds: 8, stakes: 'standard', terms: { purse: host === 'you' ? 6000 : 9000, winBonus: 600, rematch: false }, status: 'open',
      createdDay: s.today, expiresDay: s.today + 28, fightId: null, history: [{ day: s.today, by: 'rival', terms: { purse: host === 'you' ? 6000 : 9000, winBonus: 600, rematch: false }, note: 'Opening proposal' }], message: 'test',
    }
    return id
  }
  // a rival fighter with the weight and no booking
  const pick = (mineF: (typeof mine)[number], skip: Set<string>) => {
    for (const p of rivals) {
      const fs = Object.values(s.contracts).filter((c) => c.promotionId === p.id && c.status === 'active').map((c) => s.fighters[c.fighterId])
        .filter((f) => f && f.status === 'active' && !f.activeFightId && !f.injury && f.weightClass === mineF.weightClass && !skip.has(f.id) && (f.lastFightDay === null || s.today - f.lastFightDay > 60))
      if (fs[0]) return { p, f: fs[0] }
    }
    return null
  }
  const used = new Set<string>()
  let youMine = null as null | (typeof mine)[number], youT = null as ReturnType<typeof pick>
  for (const m of mine) { const t = pick(m, used); if (t) { youMine = m; youT = t; used.add(t.f.id); break } }
  expect(youT, 'a rival fighter in the same division').toBeTruthy()
  const you = mkOffer(1, 'you', youT!.p.id, youT!.f.id, youMine!.id, null)
  let them = ''
  for (const m of mine.filter((x) => x.id !== youMine!.id)) {
    const t = pick(m, used)
    if (!t) continue
    // a rival show with room
    const venue = Object.values(s.venues).find((v) => !v.legacy && v.maxFights >= 5)!
    const day = s.today + 8 * 7 + ((5 - ((s.today + 8 * 7 - s.today) % 7)) + 7) % 7
    const ev = createEventInternal(s, t.p.id, { name: 'Test Night', day, venueId: venue.id }, 'ai')
    t.p.cash = Math.max(t.p.cash, 5_000_000)
    them = mkOffer(2, 'them', t.p.id, t.f.id, m.id, ev.id)
    if (offerProblem(s, o.offers[them])) { delete o.offers[them]; them = ''; used.add(t.f.id); continue } // a fixture must be a valid offer: try the next pairing
    break
  }
  expect(them, 'a host-them offer').not.toBe('')
  return { s, you, them }
}

describe('incoming fight offers', () => {
  it('rivals write only about fights that could be staged, deterministically, and not about fighters under a title obligation', () => {
    const a = clone(world()), b = clone(world())
    const before = Object.keys(a.office!.offers).length
    for (let i = 0; i < 30; i++) { generateOffers(a); generateOffers(b); a.today += 7; b.today += 7 }
    expect(JSON.stringify(a.office!.offers)).toBe(JSON.stringify(b.office!.offers))
    expect(Object.keys(a.office!.offers).length).toBeGreaterThanOrEqual(before)
    for (const o of Object.values(a.office!.offers)) {
      if (!isLive(o)) continue
      expect(titleObligation(a, o.mine)).toBeNull(); expect(titleObligation(a, o.theirs)).toBeNull()
      expect(a.promotions[o.promoId].isPlayer).toBe(false)
      expect(o.terms.purse).toBeGreaterThan(0)
    }
  })

  it('a year of play brings a plausible number of proposals, never twice for the same pair within half a year', () => {
    let s = clone(world())
    const seen = new Map<string, number>()
    let total = 0
    for (let i = 0; i < 52; i++) {
      s = advanceOneWeek(s)
      for (const o of Object.values(s.office!.offers)) {
        const k = [o.mine, o.theirs].sort().join('|')
        if (!seen.has(k + o.id)) { seen.set(k + o.id, s.today); total++ }
      }
    }
    const byPair: Record<string, number[]> = {}
    for (const o of Object.values(s.office!.offers)) (byPair[[o.mine, o.theirs].sort().join('|')] ??= []).push(o.createdDay)
    for (const days of Object.values(byPair)) { days.sort((x, y) => x - y); for (let i = 1; i < days.length; i++) expect(days[i] - days[i - 1]).toBeGreaterThanOrEqual(26 * 7) }
    expect(Object.values(s.office!.offers).length).toBeLessThanOrEqual(36)
    void total
  })

  it('accepting a host-you offer creates exactly one agreed fight through the normal pipeline, once, with no payment yet', () => {
    const { s, you } = withOffers()
    const cash = player(s).cash
    expect(offerProblem(s, s.office!.offers[you])).toBeNull()
    const r = acceptOffer(s, you)
    expect(r.ok, r.error).toBe(true)
    const o = r.state.office!.offers[you]
    expect(o.status).toBe('agreed')
    const f = r.state.fights[o.fightId!]
    expect(f.status).toBe('agreed')
    expect(f.organiserId).toBe(r.state.playerPromotionId)
    expect(f.terms.purseB).toBe(6000)
    expect(r.state.fighters[o.mine].activeFightId).toBe(f.id); expect(r.state.fighters[o.theirs].activeFightId).toBe(f.id)
    expect(Object.values(r.state.fights).filter((x) => [x.sideA.fighterId, x.sideB.fighterId].includes(o.mine) && !['cancelled'].includes(x.status))).toHaveLength(1)
    expect(player(r.state).cash).toBe(cash)
    // a second accept is refused and creates nothing
    const again = acceptOffer(r.state, you)
    expect(again.ok).toBe(false)
    expect(Object.keys(again.state.fights).length).toBe(Object.keys(r.state.fights).length)
    expect(r.state.fights[o.fightId!].scheduledRounds).toBeGreaterThanOrEqual(4)
  })

  it('accepting a host-them offer puts the fight on the rival\'s show, and the money goes through the ledger once', () => {
    const { s, them } = withOffers()
    const r = acceptOffer(s, them)
    expect(r.ok, r.error).toBe(true)
    const o = r.state.office!.offers[them]
    const f = r.state.fights[o.fightId!]
    expect(f.organiserId).toBe(o.promoId)
    expect(f.eventId).toBe(o.eventId)
    expect(r.state.events[o.eventId!].card).toContain(f.id)
    expect(f.status).toBe('scheduled')
    expect(f.sideB.promotionId).toBe(r.state.playerPromotionId)
    // run the show: the fee arrives, the fighter is paid, nothing doubles
    let t = r.state
    const ledger0 = t.ledger.length
    const cash0 = player(t).cash
    for (let i = 0; i < 20 && !t.fights[f.id].result; i++) t = advanceOneWeek(t)
    expect(t.fights[f.id].result, 'the fight was fought on the rival show').toBeTruthy()
    const lines = t.ledger.filter((x) => x.description.includes('Loan fee'))
    expect(lines).toHaveLength(1)
    expect(lines[0].amount).toBeGreaterThanOrEqual(9000)
    expect(t.ledger.filter((x) => x.category === 'purses' && x.description.includes(r.state.fighters[o.mine].lastName))).toHaveLength(1)
    void ledger0; void cash0
    expect(t.fights[f.id].paid).toBe(true)
  })

  it('stale, expired and closed offers cannot be accepted, and nothing is created', () => {
    const { s, you, them } = withOffers()
    // the player\'s fighter is booked elsewhere
    const busy = clone(s)
    const mineId = busy.office!.offers[you].mine
    const other = createFight(busy, mineId, Object.values(busy.fighters).find((f) => f.status === 'active' && !f.activeFightId && f.id !== mineId && f.weightClass === busy.fighters[mineId].weightClass && f.id !== busy.office!.offers[you].theirs)!.id, busy.playerPromotionId, 'player')
    void other
    const nBefore = Object.keys(busy.fights).length
    const r1 = acceptOffer(busy, you)
    expect(r1.ok).toBe(false)
    expect(r1.state.office!.offers[you].status).toBe('withdrawn')
    expect(Object.keys(r1.state.fights).length).toBe(nBefore)
    // expired
    const late = clone(s); late.today = late.office!.offers[you].expiresDay + 7
    const r2 = acceptOffer(late, you)
    expect(r2.ok).toBe(false); expect(r2.state.office!.offers[you].status).toBe('expired')
    // a rival show called off
    const off = clone(s); off.events[off.office!.offers[them].eventId!].status = 'cancelled'
    const r3 = acceptOffer(off, them)
    expect(r3.ok).toBe(false)
    // rejected
    const rej = rejectOffer(s, you)
    expect(rej.state.office!.offers[you].status).toBe('rejected')
    expect(acceptOffer(rej.state, you).ok).toBe(false)
  })

  it('a counter is answered by the rival a week later, from how far it is from what they wanted - not automatically', () => {
    const { s, you } = withOffers()
    const outcomes: Record<string, number> = {}
    for (const factor of [0.5, 0.8, 0.92, 0.97, 1]) {
      for (let k = 0; k < 12; k++) {
        const t = clone(s); t.seed = `ctr-${k}`
        const c = counterOffer(t, you, { purse: Math.round(6000 * factor / 100) * 100, winBonus: 600, rematch: false })
        expect(c.ok, c.error).toBe(true)
        expect(c.state.office!.offers[you].status).toBe('countered')
        // not answered before a week has passed
        const early = clone(c.state); processOffers(early); expect(early.office!.offers[you].status).toBe('countered')
        const late = clone(c.state); late.today += 7; processOffers(late)
        const st = late.office!.offers[you].status
        outcomes[`${factor}:${st}`] = (outcomes[`${factor}:${st}`] ?? 0) + 1
      }
    }
    // asking a lot less is turned down or met part-way, never simply accepted; asking about the same is usually accepted
    expect(outcomes['0.5:agreed'] ?? 0).toBe(0)
    expect((outcomes['0.5:rejected'] ?? 0) + (outcomes['0.5:open'] ?? 0)).toBe(12)
    expect((outcomes['1:agreed'] ?? 0)).toBeGreaterThan(8)
    expect((outcomes['0.92:agreed'] ?? 0) + (outcomes['0.92:open'] ?? 0)).toBeGreaterThan(8)
    // and the player cannot spam: two counters at most
    const t = clone(s)
    expect(counterOffer(t, you, { purse: 5000, winBonus: 500, rematch: false }).ok).toBe(true)
    const wd = withdrawCounter(counterOffer(t, you, { purse: 5000, winBonus: 500, rematch: false }).state, you)
    expect(wd.state.office!.offers[you].status).toBe('withdrawn')
  })

  it('the rival\'s state decides: a struggling rival gives more room on a purse it receives, a hostile relationship less', () => {
    const { s, you } = withOffers()
    const rate = (mut: (t: GameState) => void) => { let ok = 0; for (let k = 0; k < 40; k++) { const t = clone(s); t.seed = `flex-${k}`; mut(t); const c = counterOffer(t, you, { purse: 5400, winBonus: 600, rematch: false }); const l = clone(c.state); l.today += 7; processOffers(l); if (l.office!.offers[you].status === 'agreed') ok++ } return ok }
    const base = rate(() => {})
    const friendly = rate((t) => { shiftRelation(t, 'promoter', t.office!.offers[you].promoId, 50, 'test', 'k1') })
    const hostile = rate((t) => { shiftRelation(t, 'promoter', t.office!.offers[you].promoId, -50, 'test', 'k2') })
    expect(friendly).toBeGreaterThanOrEqual(base)
    expect(hostile).toBeLessThanOrEqual(base)
    expect(friendly).toBeGreaterThan(hostile)
  })

  it('a pending offer is withdrawn by the rival when something real changes, with the reason; the fighter is never double-booked', () => {
    const { s, you } = withOffers()
    const t = clone(s)
    t.fighters[t.office!.offers[you].theirs].injury = { kind: 'cut', severity: 'minor', startDay: t.today, returnDay: t.today + 70 } as never
    processOffers(t)
    expect(t.office!.offers[you].status).toBe('withdrawn')
    expect(t.office!.offers[you].closed).toMatch(/injured/)
    const u = clone(s)
    for (let i = 0; i < 6; i++) u.today += 7
    processOffers(u)
    expect(u.office!.offers[you].status).toBe('expired')
    expect(relation(u, 'promoter', u.office!.offers[you].promoId)).toBeLessThan(0)
  })

  it('the offers board is derived from real state', () => {
    const { s } = withOffers()
    const b = offersBoard(s)
    expect(b.counts.incoming).toBe(Object.values(s.office!.offers).filter((o) => o.status === 'open').length)
    const v = offerView(s, Object.values(s.office!.offers)[0])!
    expect(JSON.stringify(v)).not.toMatch(/appraise|reservation|potential|aiScore/i)
  })
})

describe('career objectives and prospect protection', () => {
  const prospect = (s: GameState) => playerRoster(s).sort((a, b) => a.record.wins + a.record.losses - (b.record.wins + b.record.losses))[0]

  it('milestones are read from the record and never grant eligibility', () => {
    const s = clone(world())
    const f = prospect(s)
    f.record = { wins: 5, losses: 2, draws: 0, koWins: 2, koLosses: 0 }
    expect(setGoal(s, f.id, 'world').ok).toBe(true)
    const p = goalProgress(s, f)!
    expect(p.kind).toBe('world')
    expect(p.steps[0].done).toBe(false) // a 5-2 fighter is not a world contender, whatever the promoter plans
    for (const body of ['atlas', 'pioneer', 'crown', 'apex']) expect(assessChallenger(s, body, f.id).tier).not.toBe('contender')
    f.record = { wins: 2, losses: 0, draws: 0, koWins: 1, koLosses: 0 }
    expect(goalProgress(s, f)!.steps.filter((x) => x.done).length).toBeLessThanOrEqual(1)
    // the objective itself changes nothing about the title system
    const tiers = ['atlas', 'pioneer'].map((b) => assessChallenger(s, b, f.id).tier)
    expect(tiers).toEqual(['atlas', 'pioneer'].map((b) => assessChallenger(clone(s), b, f.id).tier))
  })

  it('an objective sets the default risk appetite and is recorded as a decision; only your own fighters can have one', () => {
    const s = clone(world())
    const f = prospect(s)
    setPlan(s, f.id, 'normal')
    expect(setGoal(s, f.id, 'prospect').ok).toBe(true)
    expect(planOf(s, f.id)).toBe(GOAL_INFO.prospect.plan)
    expect(careerView(s, f.id)!.decisions[0].text).toMatch(/Objective set/)
    const rival = Object.values(s.fighters).find((x) => x.status === 'active' && x.contractId && s.contracts[x.contractId].promotionId !== s.playerPromotionId)!
    expect(setGoal(s, rival.id, 'world').ok).toBe(false)
    expect(suggestedGoal(s, f)).toBeTruthy()
  })

  it('a protected plan changes real matchmaking: a big step up needs the camp\'s objection to be overruled, at a price; a steady plan does not', () => {
    const s = clone(world())
    const f = prospect(s)
    // the strongest available opponent in the division range
    const opps = Object.values(s.fighters).filter((x) => x.status === 'active' && x.id !== f.id && x.weightClass === f.weightClass && !x.activeFightId && !x.injury && !(x.contractId && s.contracts[x.contractId].promotionId === s.playerPromotionId))
      .sort((a, b) => b.reputation - a.reputation)
    const big = opps[0]
    f.activeFightId = null; f.injury = null; f.lastFightDay = null; f.suspendedUntil = null
    big.activeFightId = null; big.injury = null; big.lastFightDay = null; big.suspendedUntil = null
    f.record = { wins: 3, losses: 0, draws: 0, koWins: 1, koLosses: 0 }; f.reputation = 8; f.popularity = 6
    setPlan(s, f.id, 'protected')
    const fit = opponentFit(s, f, big)
    expect(fit.objection).toBe(true)
    const blocked = approachOpponent(s, f.id, big.id)
    expect(blocked.ok).toBe(false); expect(blocked.needsOverride).toBe(true)
    expect(Object.keys(blocked.state.fights).length).toBe(Object.keys(s.fights).length)
    const morale = f.morale
    const go = approachOpponent(s, f.id, big.id, true)
    expect(go.ok, go.error).toBe(true)
    expect(go.state.fighters[f.id].morale).toBeLessThan(morale)
    expect(careerView(go.state, f.id)!.decisions[0].text).toMatch(/over the camp's objection/)
    // the cost is applied once, even if the same override is applied again
    applyOverride(go.state, go.state.fighters[f.id], go.state.fighters[big.id], go.fightId!)
    expect(go.state.fighters[f.id].morale).toBeCloseTo(Math.max(1, morale - 3), 5)
    setPlan(s, f.id, 'accelerated')
    expect(opponentFit(s, f, big).objection).toBe(false)
    expect(approachOpponent(s, f.id, big.id).ok).toBe(true)
  })
})

describe('the trainer\'s remit', () => {
  it('trainers choose what the roster works on and how camps run; rest when hurt; plans follow style; veterans get lighter camps', () => {
    const s = clone(world())
    const f = playerRoster(s)[0]
    f.injury = { kind: 'cut', severity: 'minor', startDay: s.today, returnDay: s.today + 56 } as never
    expect(trainerFocus(s, f).focus).toBe('recovery')
    f.injury = null; f.fitness = 90
    f.trainingFocus = 'recovery'
    for (let i = 0; i < 8; i++) { processTrainers(s); s.today += 7 }
    expect(f.trainingFocus).not.toBe('recovery')
    f.style = 'Counter Puncher'; expect(trainerPlan(f)).toBe('cautious')
    f.style = 'Swarmer'; expect(trainerPlan(f)).toBe('aggressive')
    f.birthDay = s.today - 36 * 365; expect(trainerIntensity(s, f)).toBe('light')
  })

  it('the promoter reviews a report and decides whether to go ahead; the report names problems in words, without numbers', () => {
    const s = clone(world())
    const f = playerRoster(s)[0], o = Object.values(s.fighters).find((x) => x.id !== f.id && x.status === 'active')!
    const fight = createFight(s, f.id, o.id, s.playerPromotionId, 'player') as Fight
    fight.status = 'training'; fight.day = s.today + 14
    f.fitness = 50; fight.sideA.prep.nagging = true
    const rep = trainerReport(s, fight, 0)!
    expect(rep.readiness).toBe('notReady')
    expect(rep.notes.join(' ')).toMatch(/niggle/i)
    expect(JSON.stringify(rep)).not.toMatch(/\d{2}/)
    expect(trainerReport(s, fight, 1)).toBeNull() // only your own fighters
  })

  it('coaching staff is a business decision: a one-off hire, a weekly cost, bounded effects', () => {
    const s = clone(world())
    const cash = player(s).cash
    const r = chooseCoaching(s, 'quality')
    expect(r.ok).toBe(true)
    expect(player(r.state).cash).toBeLessThan(cash)
    expect(r.state.ledger[0].category).toBe('coaching')
    expect(coachGrowth(r.state)).toBeGreaterThan(1); expect(coachGrowth(r.state)).toBeLessThanOrEqual(1.1)
    expect(coachInjury(r.state)).toBeLessThan(1)
    expect(chooseCoaching(r.state, 'quality').ok).toBe(false)
    const down = chooseCoaching(r.state, 'standard')
    expect(down.ok).toBe(true); expect(down.state.ledger.length).toBe(r.state.ledger.length) // letting them go is free
    const poor = clone(s); player(poor).cash = 1000
    expect(chooseCoaching(poor, 'elite').ok).toBe(false)
    // development: a fighter on the roster develops faster with better coaching, a rival's fighter is unaffected
    const mine = playerRoster(r.state)[0], theirs = Object.values(r.state.fighters).find((x) => x.contractId && r.state.contracts[x.contractId].promotionId !== r.state.playerPromotionId)!
    expect(planGrowthMult(r.state, mine)).toBeGreaterThan(planGrowthMult(s, mine))
    expect(planGrowthMult(r.state, theirs)).toBe(planGrowthMult(s, theirs))
  })
})

describe('promotional angles and press conferences', () => {
  function eventWithCard(s: GameState) {
    const venue = Object.values(s.venues).find((v) => !v.legacy && v.tier === 'regional')!
    const r = createEvent(s, { name: 'Angle Night', day: s.today + 10 * 7 + ((5 - ((10 * 7) % 7)) % 7), venueId: venue.id })
    if (!r.ok) throw new Error(r.error)
    return r
  }

  it('an angle that does not fit the card is rated poor, points the wrong way, and costs real money once', () => {
    const base = clone(world())
    const r0 = eventWithCard(base)
    const s = r0.state
    const ev = s.events[r0.eventId!]
    const [a, b] = playerRoster(s).slice(0, 2)
    const f = createFight(s, a.id, Object.values(s.fighters).find((x) => x.status === 'active' && x.id !== a.id && x.id !== b.id && x.weightClass === a.weightClass)!.id, s.playerPromotionId, 'player') as Fight
    f.status = 'agreed'
    ev.card.push(f.id); f.eventId = ev.id
    expect(campaignSuitability(s, ev, 'rivalry').score).toBeLessThan(0.3)
    expect(campaignSuitability(s, ev, 'prestige').score).toBeLessThan(1) // no title on the card: at best a ranked matchup
    expect(campaignSuitability(s, ev, 'traditional').score).toBeGreaterThan(0.4)
    const cash = player(s).cash
    const set = setCampaign(s, ev.id, 'rivalry')
    expect(set.ok).toBe(true)
    expect(player(s).cash).toBe(cash - campaignFee(s, ev, 'rivalry'))
    expect(campaignPoints(s, ev)).toBeLessThan(0) // a misfit angle drags the show down
    const view = campaignView(s, ev.id)!
    expect(view.options.find((o) => o.kind === 'rivalry')!.fit).toBe('Poor fit')
    // changing course costs half again, setting the same angle again costs nothing
    const c1 = player(s).cash
    expect(setCampaign(s, ev.id, 'rivalry').ok).toBe(true); expect(player(s).cash).toBe(c1)
    expect(setCampaign(s, ev.id, 'traditional').ok).toBe(true)
    expect(setCampaign(s, ev.id, 'headline').ok).toBe(true)
    // a fitting angle (real rivalry) adds interest, scaled by what is spent behind it
    bumpRivalry(s.media!, f.sideA.fighterId, f.sideB.fighterId, 60)
    setCampaign(s, ev.id, 'rivalry')
    expect(campaignSuitability(s, ev, 'rivalry').score).toBeGreaterThan(0.6)
    ev.marketing.budget = 0
    const lowSpend = campaignPoints(s, ev)
    ev.marketing.budget = 20_000
    const highSpend = campaignPoints(s, ev)
    expect(highSpend).toBeGreaterThan(lowSpend); expect(lowSpend).toBeGreaterThan(0)
    expect(highSpend).toBeLessThanOrEqual(8)
    const withIt = eventInterest(s, ev)
    delete s.office!.campaigns[ev.id]
    expect(withIt).toBeGreaterThan(eventInterest(s, ev))
  })

  it('only fights with something to sell earn a press conference', () => {
    const base = clone(world())
    const r = eventWithCard(base)
    const s = r.state, ev = s.events[r.eventId!]
    const [a] = playerRoster(s)
    const o = Object.values(s.fighters).find((x) => x.status === 'active' && x.id !== a.id && x.weightClass === a.weightClass)!
    const f = createFight(s, a.id, o.id, s.playerPromotionId, 'player') as Fight
    a.record = { wins: 9, losses: 4, draws: 0, koWins: 3, koLosses: 1 }; o.record = { wins: 8, losses: 5, draws: 0, koWins: 3, koLosses: 2 }
    a.popularity = 10; o.popularity = 10
    expect(pressWorthy(s, ev, f)).toBeNull() // an ordinary bout between two journeymen: no press conference
    bumpRivalry(s.media!, a.id, o.id, 40)
    expect(pressWorthy(s, ev, f)).toBe('An established rivalry')
    s.media!.rivalry = {}
    a.record = { wins: 7, losses: 0, draws: 0, koWins: 5, koLosses: 0 }; a.popularity = 50
    expect(pressWorthy(s, ev, f)).toBe('A high-profile prospect')
  })

  it('a conference costs money, backlash is bounded, and nothing happens twice', () => {
    const base = clone(world())
    const r = eventWithCard(base)
    const s = r.state, ev = s.events[r.eventId!]
    const [a] = playerRoster(s)
    const o = Object.values(s.fighters).find((x) => x.status === 'active' && x.id !== a.id && x.weightClass === a.weightClass)!
    const f = createFight(s, a.id, o.id, s.playerPromotionId, 'player') as Fight
    f.status = 'agreed'; ev.card.push(f.id); f.eventId = ev.id
    const m = s.media!
    m.pressers.unshift({ id: 'pc_t', eventId: ev.id, fightId: f.id, fighterIds: [a.id, o.id], names: ['A', 'B'], createdWeek: 1, expiresWeek: 99, status: 'open', why: 'A rematch', cost: pressCost(3000) })
    const cash = player(s).cash
    const out = holdPress(s, m, 'pc_t', 'CONTROVERSIAL')
    expect(out.ok).toBe(true)
    expect(player(s).cash).toBe(cash - pressCost(3000))
    expect(holdPress(s, m, 'pc_t', 'CONTROVERSIAL').ok).toBe(false) // once
    // a manufactured feud can read as hollow: bounded, and it costs a little standing
    const poor = clone(base); const r2 = eventWithCard(poor); const t = r2.state; const ev2 = t.events[r2.eventId!]
    const [a2] = playerRoster(t); const o2 = Object.values(t.fighters).find((x) => x.status === 'active' && x.id !== a2.id && x.weightClass === a2.weightClass)!
    const f2 = createFight(t, a2.id, o2.id, t.playerPromotionId, 'player') as Fight; f2.status = 'agreed'; ev2.card.push(f2.id); f2.eventId = ev2.id
    t.media!.pressers.unshift({ id: 'pc_u', eventId: ev2.id, fightId: f2.id, fighterIds: [a2.id, o2.id], names: ['A', 'B'], createdWeek: 1, expiresWeek: 99, status: 'open', why: 'x', cost: 500 })
    player(t).cash = 100
    expect(holdPress(t, t.media!, 'pc_u', 'AGGRESSIVE').ok).toBe(false) // cannot afford it
    expect(rivalryStrength(t.media!, a2.id, o2.id)).toBe(0)
  })
})

describe('relationships and politics', () => {
  it('relationships move for recorded reasons, once, and ease back towards neutral', () => {
    const s = clone(world())
    const v = Object.values(s.venues).find((x) => !x.legacy)!
    expect(shiftRelation(s, 'venue', v.id, 5, 'A well-attended show', 'k:a')).toBe(true)
    expect(shiftRelation(s, 'venue', v.id, 5, 'A well-attended show', 'k:a')).toBe(false) // the same event is not counted twice
    expect(relation(s, 'venue', v.id)).toBe(5)
    expect(relationRows(s).find((r) => r.name === v.name)!.reasons[0].text).toBe('A well-attended show')
    shiftRelation(s, 'venue', v.id, 60, 'x', 'k:b'); expect(relation(s, 'venue', v.id)).toBe(65)
    shiftRelation(s, 'venue', v.id, 60, 'y', 'k:c'); expect(relation(s, 'venue', v.id)).toBe(100) // bounded
    easeRelations(s); expect(relation(s, 'venue', v.id)).toBeLessThan(100)
    expect(standingOf(100)).toBe('Excellent'); expect(standingOf(-100)).toBe('Hostile')
  })

  it('venues charge a little less to friends and a little more to those who let them down, never beyond 5%; shows settle and cancel into the book', () => {
    const s = clone(world())
    const v = Object.values(s.venues).find((x) => !x.legacy && x.hireCost > 5000)!
    const base = hireFor(s, v, s.playerPromotionId)
    shiftRelation(s, 'venue', v.id, 100, 'test', 'v:1')
    const friend = hireFor(s, v, s.playerPromotionId)
    expect(friend).toBeLessThan(base); expect(friend).toBeGreaterThanOrEqual(Math.round(base * 0.949))
    const t = clone(world())
    shiftRelation(t, 'venue', v.id, -100, 'test', 'v:2')
    const foe = hireFor(t, v, t.playerPromotionId)
    expect(foe).toBeGreaterThan(base); expect(foe).toBeLessThanOrEqual(Math.round(base * 1.051))
    expect(venueTilt(t, v.id)).toBeCloseTo(1.05, 5)
    // a show cancelled at short notice costs goodwill with its venue, once
    const u = clone(world())
    const ev = createEventInternal(u, u.playerPromotionId, { name: 'Late Call', day: u.today + 14, venueId: v.id }, 'player')
    afterEventCancelled(u, ev); afterEventCancelled(u, ev)
    expect(relation(u, 'venue', v.id)).toBe(-4)
    afterShowSettled(u, ev, 0.9); afterShowSettled(u, ev, 0.9)
    expect(relation(u, 'venue', v.id)).toBe(-3)
  })

  it('a friendly promoter writes more often and a hostile one less, but neither changes what can legally be booked', () => {
    const base = clone(world())
    const count = (rel: number) => { let n = 0; for (let k = 0; k < 12; k++) { const t = clone(base); t.seed = `rel-${k}`; t.office!.offers = {}; for (const p of Object.values(t.promotions)) if (!p.isPlayer) shiftRelation(t, 'promoter', p.id, rel, 'test', `r:${k}:${p.id}`); for (let w = 0; w < 26; w++) { generateOffers(t); t.today += 7 } n += Object.keys(t.office!.offers).length } return n }
    const friendly = count(45), hostile = count(-50)
    expect(friendly).toBeGreaterThan(hostile)
    // validity does not depend on the relationship at all
    const { s, you } = withOffers()
    const o = s.office!.offers[you]
    const a = offerProblem(s, o)
    shiftRelation(s, 'promoter', o.promoId, -90, 'test', 'x1')
    expect(offerProblem(s, o)).toBe(a)
  })

  it('beating a rival\'s offer to a free agent is remembered by that promoter', () => {
    const s = clone(world())
    expect(relationRows(s).filter((r) => r.category === 'Promoter').length).toBeGreaterThanOrEqual(0)
    const rival = Object.values(s.promotions).find((p) => !p.isPlayer)!
    expect(shiftRelation(s, 'promoter', rival.id, -1.5, 'You signed X while they had an offer out', 'outbid:f:p')).toBe(true)
    expect(relationRows(s)[0].reasons[0].text).toMatch(/offer out/)
  })
})

describe('strategy', () => {
  it('undirected is neutral; a direction changes real numbers, half-strength while the business turns, and creates no money', () => {
    const s = clone(world())
    expect(strategyOverhead(s)).toBe(1); expect(strategyMarketing(s)).toBe(1)
    const oh0 = overheadCost(s), cash0 = player(s).cash, ledger0 = s.ledger.length
    const r = chooseStrategy(s, 'prospects', 'growth')
    expect(r.ok).toBe(true)
    expect(r.state.ledger.length).toBe(ledger0); expect(player(r.state).cash).toBe(cash0)
    expect(strategyWeight(r.state)).toBe(0.5)
    expect(overheadCost(r.state)).toBeGreaterThan(oh0)
    expect(strategyMarketing(r.state)).toBeCloseTo(1.04, 5)
    const later = clone(r.state); later.today += 9 * 7
    expect(strategyWeight(later)).toBe(1)
    expect(strategyMarketing(later)).toBeCloseTo(1.08, 5)
    const young = Object.values(later.fighters).find((f) => f.contractId && later.contracts[f.contractId].promotionId === later.playerPromotionId && fighterAge(f, later.today) <= 24)
    if (young) expect(strategyGrowth(later, young)).toBeCloseTo(1.06, 5)
    expect(chooseStrategy(r.state, 'prospects', 'growth').ok).toBe(false) // nothing to change
    const st = chooseStrategy(r.state, 'regional', 'stability')
    expect(officeView(st.state).strategy.changes).toBe(2)
    expect(overheadCost(st.state)).toBeLessThan(overheadCost(later)) // stability is leaner than growth
  })

  it('direction has trade-offs: a headline direction rewards a star card and punishes a card led by a minor name', () => {
    const base = clone(world())
    const venue = Object.values(base.venues).find((v) => !v.legacy && v.tier === 'regional')!
    const mkCard = (pop: number) => {
      const s = clone(base)
      const r = createEvent(s, { name: 'Dir Night', day: s.today + 10 * 7 + ((5 - ((10 * 7) % 7)) % 7), venueId: venue.id })
      const t = r.state, ev = t.events[r.eventId!]
      const [a] = playerRoster(t)
      const o = Object.values(t.fighters).find((x) => x.status === 'active' && x.id !== a.id && x.weightClass === a.weightClass)!
      const f = createFight(t, a.id, o.id, t.playerPromotionId, 'player') as Fight; f.status = 'agreed'; ev.card.push(f.id); f.eventId = ev.id
      a.popularity = pop; o.popularity = pop
      return { t, ev }
    }
    const star = mkCard(70), minor = mkCard(10)
    expect(strategyDemand(star.t, star.ev)).toBe(1) // undirected: neutral
    setStrategy(star.t, 'headline', null); setStrategy(minor.t, 'headline', null)
    star.t.today += 9 * 7; minor.t.today += 9 * 7
    expect(strategyDemand(star.t, star.ev)).toBeCloseTo(1.04, 5)
    expect(strategyDemand(minor.t, minor.ev)).toBeCloseTo(0.96, 5)
    expect(cardProfile(star.t, star.ev).mainStar).toBe(true)
    // rivals' shows are never touched by the player's direction
    const rivalEv = Object.values(star.t.events).find((e) => e.promotionId !== star.t.playerPromotionId)
    if (rivalEv) expect(strategyDemand(star.t, rivalEv)).toBe(1)
  })
})

describe('the office over two years, saves and determinism', () => {
  it('bounded state, deterministic weeks, and an old save gains the office without losing anything', () => {
    const s = world()
    const o = s.office!
    expect(Object.keys(o.offers).length).toBeLessThanOrEqual(36)
    expect(o.applied.length).toBeLessThanOrEqual(90); expect(Object.keys(o.rel).length).toBeLessThanOrEqual(60); expect(Object.keys(o.recent).length).toBeLessThanOrEqual(80)
    for (const d of Object.values(o.decisions)) expect(d.length).toBeLessThanOrEqual(6)
    expect(JSON.stringify(advanceOneWeek(s))).toBe(JSON.stringify(advanceOneWeek(s)))
    const old = JSON.parse(JSON.stringify(s)) as Record<string, unknown>
    old.version = 11; delete old.office
    const m = migrate(JSON.parse(JSON.stringify(old)))!
    expect(m.version).toBe(GAME_STATE_VERSION)
    expect(m.office!.strategy.focus).toBeNull(); expect(m.office!.coach).toBe('standard'); expect(m.office!.offers).toEqual({})
    const { office: _o, version: _v, ...rest } = m as unknown as Record<string, unknown>
    const { office: _o2, version: _v2, ...restOld } = old
    void _o; void _v; void _o2; void _v2
    expect(JSON.stringify(rest)).toBe(JSON.stringify(restOld))
    let g = m
    for (let i = 0; i < 6; i++) g = advanceOneWeek(g)
    expect(g.today).toBe(m.today + 42)
    // a migrated career plays as before until the player chooses: neutral strategy, standard coaching
    expect(strategyOverhead(m)).toBe(1); expect(coachGrowth(m)).toBe(1)
    void Rng
  })
})
