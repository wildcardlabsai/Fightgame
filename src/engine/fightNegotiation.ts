/**
 * FIGHT NEGOTIATION (Phase 3)
 * Same shape as Phase 2 contract negotiation — evaluate → accept / counter / reject, patience, lockout —
 * but the terms are a bout: the opponent's purse and win bonus, venue preference, a rematch clause and a
 * one- or two-fight deal. The opponent's camp judges risk from THEIR view of your fighter (an appraisal with
 * noise), then personality, promotion clout, reward and form.
 */
import { BALANCE as B } from './balance'
import { fighterName, publicFacts } from './fighters'
import { createFight, fightAvailability, lockKey, validateMatch, cancelFight, defaultPrep } from './fights'
import { clearBookings } from './fights'
import { transition } from './fight/lifecycle'
import { stateIds } from './ids'
import { baseMoney, normaliseOffer as _n, appraise, valueOf } from './market'
import { boundedPurse, careerValue, contextFor, eventRevenueMid } from './business/marketValue'
import { postMessage } from './messages'
import { TIER_ORDER } from './promotions'
import { settleRounds } from './business/fightRounds'
import { player } from './selectors'
import type { Fight, FightOffer, GameState, Id, Mood, Promotion, Verdict } from './types'
void _n

export interface FightEvaluation { verdict: Verdict; ratio: number; counter: FightOffer | null; reasons: string[]; mood: Mood }

const round100 = (n: number) => Math.round(n / 100) * 100

function moodOf(ratio: number): Mood {
  return ratio >= 1 ? 'eager' : ratio >= 0.92 ? 'warm' : ratio >= B.negotiation.counterRatio ? 'lukewarm' : 'cold'
}

/** Pseudo-promotion for fighters without one: they judge you with regional-level scouting. */
function judgingPromo(state: GameState, promoId: Id | null): Promotion {
  if (promoId && state.promotions[promoId]) return state.promotions[promoId]
  return { ...player(state), id: 'free-agent', tier: 'Regional', isPlayer: false, ai: null }
}

export function offerValueB(o: FightOffer): number {
  const venue = o.venuePref === 'B' ? 0.06 : o.venuePref === 'A' ? -0.07 : 0
  return o.purseB * (1 + venue + (o.rematch ? 0.06 : 0) + (o.fights === 2 ? 0.04 : 0)) + 0.5 * o.winBonusB
}

/** Opponent camp's true ask (engine only). */
export function fightAsk(state: GameState, fight: Fight): FightOffer {
  const me = state.fighters[fight.sideA.fighterId], opp = state.fighters[fight.sideB.fighterId]
  const promo = judgingPromo(state, fight.sideB.promotionId)
  const pl = player(state)
  // What this bout is worth to this fighter: market rate shaped by opponent, stakes, platform and venue, held inside what the show can carry.
  const ev = fight.eventId ? state.events[fight.eventId] : undefined
  const base = boundedPurse(careerValue(state, opp), careerValue(state, me), contextFor(state, fight, 1, ev, eventRevenueMid(state, ev))) * 0.85
  // The camp's own read of how dangerous you are (noisy, tier-dependent), versus what they know about their man.
  const myStrength = appraise(state, promo, me).rating
  const theirStrength = appraise({ ...state }, { ...promo, tier: 'Global' }, opp).rating // they know their own fighter well
  const pOpp = 1 / (1 + Math.exp(-(theirStrength - myStrength) / 10))
  let mult = 1 + 1.1 * Math.max(0, 0.55 - pOpp) - 0.2 * Math.max(0, pOpp - 0.7)
  const gap = me.reputation - opp.reputation
  const exposure = Math.min(0.15, Math.max(0, gap) * 0.004)
  mult *= 1 - exposure * (['Ambitious', 'Showman'].includes(opp.personality) ? 1.4 : 1)
  mult *= 1 + 0.06 * Math.max(0, TIER_ORDER.indexOf(promo.tier) - TIER_ORDER.indexOf(pl.tier))
  mult *= B.negotiation.askMult[opp.personality] ?? 1
  if (opp.personality === 'Fragile' && pOpp < 0.5) mult *= 1.2
  if (opp.personality === 'Arrogant' && gap < -25) mult *= 1.25
  mult *= 1 - 0.05 * Math.max(0, -opp.momentum) / 100 + 0.06 * Math.max(0, opp.momentum) / 100
  const purse = round100(base * mult * thresholdFor(state, fight).thr)
  return { purseB: purse, winBonusB: round100(purse * 0.12), rematch: false, venuePref: 'neutral', fights: 1 }
}

function thresholdFor(state: GameState, fight: Fight): { thr: number; reasons: string[] } {
  const me = state.fighters[fight.sideA.fighterId], opp = state.fighters[fight.sideB.fighterId]
  const promo = judgingPromo(state, fight.sideB.promotionId)
  const reasons: string[] = []
  let thr = B.negotiation.threshold[opp.personality] ?? 1
  const gap = me.reputation - opp.reputation
  if (opp.personality === 'Arrogant' && gap < -25) { thr *= 1.3; reasons.push('does not see your fighter as worthy of the step up') }
  if (fight.sideB.promotionId && TIER_ORDER.indexOf(promo.tier) >= 2 && player(state).reputation < 15 && opp.reputation > 45) { thr *= 1.2; reasons.push('their promotion is wary of an unproven rival promoter') }
  if (promo.ai?.strategy === 'prospectFactory' && publicFacts(opp, state.today).age <= 24 && appraise(state, promo, me).rating > appraise(state, promo, opp).rating + 8) {
    thr *= 1.35; reasons.push('they are protecting a prospect and see this as too big a risk')
  }
  return { thr, reasons }
}

export function evaluateFightOffer(state: GameState, fight: Fight, raw: FightOffer): FightEvaluation {
  const offer = normaliseFightOffer(raw)
  const ask = fightAsk(state, fight)
  const vAsk = offerValueB(ask)
  const { reasons } = thresholdFor(state, fight)
  const ratio = offerValueB(offer) / vAsk
  const out = [...reasons]
  if (offer.purseB < ask.purseB * 0.85) out.push('wants a bigger purse')
  if (offer.winBonusB < ask.winBonusB * 0.7) out.push('expects a better win bonus')
  if (offer.venuePref === 'A') out.push('does not want to travel to your fighter’s backyard')
  if (ratio >= 1) return { verdict: 'accept', ratio, counter: null, reasons: [], mood: moodOf(ratio) }
  if (ratio >= B.negotiation.counterRatio) return { verdict: 'counter', ratio, counter: buildFightCounter(state, fight, offer), reasons: [...new Set(out)], mood: moodOf(ratio) }
  return { verdict: 'reject', ratio, counter: null, reasons: out.length ? [...new Set(out)] : ['feels the offer is nowhere near what this fight is worth'], mood: 'cold' }
}

function buildFightCounter(state: GameState, fight: Fight, offer: FightOffer): FightOffer {
  let c = { ...offer }
  if (c.venuePref === 'A') c.venuePref = 'neutral'
  for (let i = 0; i < 10; i++) {
    const ask = fightAsk(state, fight)
    const need = offerValueB(ask) * B.negotiation.counterMargin
    const have = offerValueB(c)
    if (have >= need) break
    c = normaliseFightOffer({ ...c, purseB: c.purseB + (need - have) / (1 + (c.rematch ? 0.06 : 0)) + 100, winBonusB: Math.max(c.winBonusB, round100(c.purseB * 0.1)) })
  }
  return c
}

export function normaliseFightOffer(o: FightOffer): FightOffer {
  return { purseB: Math.max(0, round100(o.purseB)), winBonusB: Math.max(0, round100(o.winBonusB)), rematch: !!o.rematch, venuePref: o.venuePref, fights: o.fights === 2 ? 2 : 1 }
}

/** Public, personality-free opener: roughly the going rate for a fighter of this standing. */
export function suggestedFightOffer(state: GameState, oppId: Id): FightOffer {
  const opp = state.fighters[oppId]
  const purse = round100(baseMoney(valueOf(state, opp)).purse * 0.9)
  return { purseB: purse, winBonusB: round100(purse * 0.1), rematch: false, venuePref: 'neutral', fights: 1 }
}

// ------------------------------------------------------------- Commands

export interface FightOutcome { ok: boolean; error?: string; state: GameState; fightId?: Id }

/** Approach an opponent: opens a negotiation (a Fight in the NEGOTIATING state). */
export function approachOpponent(input: GameState, myId: Id, oppId: Id): FightOutcome {
  const me = input.fighters[myId]
  const contract = me?.contractId ? input.contracts[me.contractId] : null
  if (!me || !contract || contract.promotionId !== input.playerPromotionId) return { ok: false, error: 'Choose one of your own fighters.', state: input }
  const check = validateMatch(input, myId, oppId)
  if (!check.ok) return { ok: false, error: check.reason ?? 'That match cannot be made.', state: input }
  const state = structuredClone(input)
  const opp = state.fighters[oppId]
  const fight = createFight(state, myId, oppId, state.playerPromotionId, 'player')
  fight.negotiation = { patience: B.negotiation.startingPatience[opp.personality] ?? 3, rounds: [], lastCounter: null, status: 'open' }
  return { ok: true, state, fightId: fight.id }
}

export function submitFightOffer(input: GameState, fightId: Id, raw: FightOffer): FightOutcome & { verdict?: Verdict } {
  const f0 = input.fights[fightId]
  if (!f0 || f0.status !== 'negotiating' || !f0.negotiation || f0.negotiation.status !== 'open') return { ok: false, error: 'There is no open negotiation for this fight.', state: input }
  const offer = normaliseFightOffer(raw)
  const cur = input.fighters
  const pre = validateMatch(input, f0.sideA.fighterId, f0.sideB.fighterId, fightId)
  if (!pre.ok) return { ok: false, error: pre.reason ?? 'The match is no longer possible.', state: input }
  void cur
  const state = structuredClone(input)
  const fight = state.fights[fightId]
  const neg = fight.negotiation!
  const opp = state.fighters[fight.sideB.fighterId]
  const ev = evaluateFightOffer(state, fight, offer)
  neg.rounds.push({ day: state.today, offer, verdict: ev.verdict, counter: ev.counter, reasons: ev.reasons, mood: ev.mood })
  if (neg.rounds.length > 10) neg.rounds.shift()
  const nOpp = fighterName(opp)

  if (ev.verdict === 'accept') {
    agreeFight(state, fight, offer)
    return { ok: true, state, fightId, verdict: 'accept' }
  }

  if (ev.verdict === 'counter') {
    neg.lastCounter = ev.counter
    if (neg.rounds.length > 3) neg.patience -= 0.5
    postMessage(state, { from: 'Matchmaking', category: 'fighter', priority: 'normal', subject: `Counter-offer from ${nOpp}'s camp`, body: `They want changes: ${ev.reasons.join('; ') || 'a few adjustments'}.`, link: { kind: 'fight', id: fight.id } })
  } else {
    neg.patience -= opp.personality === 'Arrogant' || opp.personality === 'Volatile' ? 1.5 : 1
    postMessage(state, { from: 'Matchmaking', category: 'fighter', priority: 'normal', subject: `${nOpp} turns down the fight`, body: `${nOpp}'s camp said no: ${ev.reasons.join('; ')}.`, link: { kind: 'fight', id: fight.id } })
  }
  if (neg.patience <= 0) {
    neg.status = 'broken'
    state.fightLocks[lockKey(fight.sideA.fighterId, fight.sideB.fighterId)] = state.today + B.fights.negotiationLockWeeks * 7
    neg.rounds[neg.rounds.length - 1].reasons.push('Talks have broken down.')
    cancelFight(state, fight, `talks with ${nOpp}'s camp collapsed`, B.fights.negotiationLockWeeks)
  }
  return { ok: true, state, fightId, verdict: ev.verdict }
}


/** The agreed bout: terms recorded, the fight moves to AGREED, a series is booked one fight at a time, and the player is told. */
export function agreeFight(state: GameState, fight: Fight, offer: FightOffer): void {
  const opp = state.fighters[fight.sideB.fighterId]
  const nOpp = fighterName(opp), nMe = fighterName(state.fighters[fight.sideA.fighterId])
  fight.terms = { ...fight.terms, ...offer }
  settleRounds(state, fight, offer.rounds)
  fight.sideB.preRecord = `${opp.record.wins}-${opp.record.losses}-${opp.record.draws}`
  transition(fight, 'agreed')
  fight.negotiation = undefined
  opp.activeFightId = fight.id
  if (offer.fights === 2) {
    const second = createFight(state, fight.sideA.fighterId, fight.sideB.fighterId, fight.organiserId, 'player', { ...fight.terms, rematch: false, fights: 1 })
    second.seriesOf = fight.id
    second.status = 'negotiating'
    transition(second, 'agreed')
    second.negotiation = undefined
    second.sideA = { ...second.sideA, prep: defaultPrep() }
    state.fighters[fight.sideA.fighterId].activeFightId = fight.id // the series is booked one fight at a time
  }
  postMessage(state, {
    from: 'Matchmaking', category: 'fighter', priority: 'important', subject: `Fight agreed: ${nMe} vs ${nOpp}`,
    body: `${nOpp}'s camp has agreed terms: £${offer.purseB.toLocaleString('en-GB')} purse${offer.rematch ? ', with a rematch clause' : ''}. Choose a date to schedule the fight.`,
    link: { kind: 'fight', id: fight.id },
  })
}

/** Abandon a negotiation or an agreed-but-unscheduled fight. */
export function withdrawFight(input: GameState, fightId: Id): FightOutcome {
  const f0 = input.fights[fightId]
  if (!f0 || !['negotiating', 'agreed', 'scheduled', 'training'].includes(f0.status)) return { ok: false, error: 'This fight cannot be withdrawn.', state: input }
  if (f0.sideA.promotionId !== input.playerPromotionId) return { ok: false, error: 'You can only withdraw fights you booked.', state: input }
  const state = structuredClone(input)
  const fight = state.fights[fightId]
  const late = fight.status === 'training' || fight.status === 'scheduled'
  cancelFight(state, fight, late ? 'withdrawn by you' : 'you walked away', late ? 12 : 0)
  if (late) {
    const pl = player(state)
    pl.reputation = Math.max(0, pl.reputation - 0.6) // pulling out of a signed fight is remembered
  }
  clearBookings(state, fight)
  return { ok: true, state, fightId }
}

export { fightAvailability, stateIds }
