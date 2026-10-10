/**
 * EXPECTED TERMS. What the player is told to expect before putting a number on the table: ranges built from PUBLIC market value,
 * nudged toward the camp's real position in proportion to how well the player knows this camp (scouting, relationship, previous
 * talks, experience, what they have been told). The range is wider when the player knows little. It is an estimate: the camp's
 * reservation price is never shown and cannot be solved from the range (the centre is shifted by at most 45% of the gap and carries
 * its own noise, and the position of the truth inside the range is not revealed).
 */
import { BALANCE as B } from '../balance'
import { clamp } from '../fighters'
import { keyedNormal } from '../rng'
import { baseMoney, askTerms } from '../market'
import { player } from '../selectors'
import type { Fighter, FightOffer, GameState, Id, Offer } from '../types'
import { ambitionOf, ambitionLabel, AMBITION_PATHWAYS, managerOf } from './manager'
import { boundedPurse, careerValue, contextFor, eventRevenueMid, purseBounds } from './marketValue'
import { fightAsk } from '../fightNegotiation'

export type Confidence = 'LOW' | 'MODERATE' | 'HIGH'
export interface Range { lo: number; hi: number }
export type Assessment = 'Generous offer' | 'Reasonable offer' | 'Light offer' | 'Lowball' | 'Not yet judged'

/** What an assessment means for a fight offer, in the player's terms (judged on the purse and win bonus against the going range; venue and clauses also count in the room). */
export const FIGHT_ASSESS_HINT: Record<Assessment, string> = {
  'Generous offer': 'Above the going rate. They should take it, and you may be paying more than you need to.',
  'Reasonable offer': 'Within the going range. They may accept, or ask for changes.',
  'Light offer': 'Below the going rate. Expect a counter.',
  'Lowball': 'Far below the going rate. They are likely to turn it down, and it can cost you goodwill.',
  'Not yet judged': 'Nothing to compare yet.',
}

export interface ConfidenceReport { level: Confidence; score: number; basis: string[] }

const nice = (n: number): number => {
  const a = Math.abs(n)
  const step = a < 2_000 ? 50 : a < 10_000 ? 100 : a < 50_000 ? 500 : a < 250_000 ? 1_000 : a < 1_000_000 ? 5_000 : 25_000
  return Math.round(n / step) * step
}
const range = (centre: number, half: number): Range => ({ lo: nice(centre * (1 - half)), hi: nice(centre * (1 + half)) })
const HALF: Record<Confidence, number> = { LOW: 0.34, MODERATE: 0.2, HIGH: 0.11 }

export const toldTags = (state: GameState, fighterId: Id): string[] => state.business?.learned[fighterId] ?? []

/** How well does the player know this camp? Never reads anything hidden: only the player's own history with them. */
export function confidenceFor(state: GameState, fighterId: Id): ConfidenceReport {
  const f = state.fighters[fighterId]
  const basis: string[] = []
  let score = 20
  const k = state.knowledge[fighterId]
  if (k && k.reports.length > 0) { const v = Math.min(24, k.reports.length * 8); score += v; basis.push(`${k.reports.length} scouting report${k.reports.length === 1 ? '' : 's'}`) }
  if (k && k.insight > 0) score += Math.min(12, k.insight * 0.12)
  const rel = f?.promoRelations[state.playerPromotionId] ?? 0
  if (rel > 0) { score += Math.min(14, rel * 0.2); if (rel >= 20) basis.push('a good relationship with their camp') }
  const rec = state.business?.neg[fighterId]
  if (rec && rec.talks > 0) { score += Math.min(12, rec.talks * 4); basis.push(`${rec.talks} previous negotiation${rec.talks === 1 ? '' : 's'}`) }
  const exp = state.business?.exp ?? 0
  if (exp > 0) { score += Math.min(10, exp * 1.2); if (exp >= 4) basis.push('your experience at the table') }
  const told = toldTags(state, fighterId)
  if (told.length) { score += Math.min(18, told.length * 6); basis.push('what their camp has told you') }
  score = clamp(score, 0, 100)
  return { level: score < 38 ? 'LOW' : score < 62 ? 'MODERATE' : 'HIGH', score: Math.round(score), basis }
}

export interface ExpectedContractTerms {
  confidence: ConfidenceReport
  purse: Range
  winBonus: Range
  retainer: Range
  signing: Range
  fightsPerYear: Range
  years: Range
  pathway: string
  assessment: Assessment
  /** One line the UI can show under the panel. */
  note: string
}

function shifted(pub: number, truth: number, conf: ConfidenceReport, seed: string, id: Id, tag: string, quarter: number): number {
  const pull = 0.45 * (conf.score / 100)
  const noise = 1 + keyedNormal(seed, 'terms', id, tag, quarter) * 0.05 * (1 - conf.score / 100)
  return (pub + (truth - pub) * pull) * noise
}

function pathwayLine(state: GameState, f: Fighter, conf: ConfidenceReport, told: string[]): string {
  const a = ambitionOf(state, f)
  if (told.includes('ambition')) return `Preferred — ${ambitionLabel(a.kind).toLowerCase()}`
  if (conf.level === 'HIGH') return (managerOf(state, f).weights.title >= 0.6 || (AMBITION_PATHWAYS[a.kind]?.length ?? 0) > 0) ? 'Likely preferred' : 'Likely not a priority'
  return 'Unknown'
}

/** Expected terms for signing or renewing a fighter. `offer` (optional) is judged against the range. */
export function expectedContractTerms(state: GameState, fighterId: Id, kind: 'signing' | 'renewal', offer?: Offer | null): ExpectedContractTerms | null {
  const f = state.fighters[fighterId]
  if (!f) return null
  const conf = confidenceFor(state, fighterId)
  const mv = careerValue(state, f)
  const pub = baseMoney(mv)
  const truth = askTerms(state, f, player(state), kind)
  const quarter = Math.floor(state.today / 91)
  const half = HALF[conf.level]
  const purseC = shifted(pub.purse, truth.basePurse, conf, state.seed, fighterId, 'purse', quarter)
  const retC = shifted(pub.retainer, truth.weeklyRetainer, conf, state.seed, fighterId, 'ret', quarter)
  const purse = range(purseC, half)
  const retainer = range(retC, half)
  const winBonus = range(purseC * B.market.winBonusOfPurse, half + 0.04)
  const signing = range(purseC * B.market.signingBonusOfPurse, half + 0.06)
  const fpy = conf.level === 'LOW' ? { lo: 1, hi: 3 } : { lo: Math.max(1, truth.minFightsPerYear - (conf.level === 'MODERATE' ? 1 : 0)), hi: truth.minFightsPerYear + 1 }
  const yrs = conf.level === 'LOW' ? { lo: 1, hi: 3 } : { lo: Math.max(1, truth.years - 1), hi: truth.years + (conf.level === 'MODERATE' ? 1 : 0) }
  const told = toldTags(state, fighterId)
  let assessment: Assessment = 'Not yet judged'
  if (offer) {
    const per = (o: Offer, p: number, w: number, r: number) => p + 0.55 * w + (r * 52 * o.years) / Math.max(1, o.fights)
    const mid = per(offer, (purse.lo + purse.hi) / 2, (winBonus.lo + winBonus.hi) / 2, (retainer.lo + retainer.hi) / 2)
    const have = per(offer, offer.basePurse, offer.winBonus, offer.weeklyRetainer)
    const ratio = have / Math.max(1, mid)
    assessment = ratio >= 1.12 ? 'Generous offer' : ratio >= 0.93 ? 'Reasonable offer' : ratio >= 0.8 ? 'Light offer' : 'Lowball'
    // Never contradict the ranges printed beside the verdict: terms inside them are not light or a lowball; terms below all of them are not reasonable.
    const loV = per(offer, purse.lo, winBonus.lo, retainer.lo)
    if (have >= loV && (assessment === 'Light offer' || assessment === 'Lowball')) assessment = 'Reasonable offer'
    if (have < loV && assessment === 'Reasonable offer') assessment = 'Light offer'
  }
  const note = conf.level === 'LOW' ? 'You do not know this camp yet — treat the ranges as a rough guide.' : conf.level === 'MODERATE' ? 'You have some sense of where they stand.' : 'You know this camp well.'
  return { confidence: conf, purse, winBonus, retainer, signing, fightsPerYear: fpy, years: yrs, pathway: pathwayLine(state, f, conf, told), assessment, note }
}

/** Where an offer's money sits against the going range (purse plus 55% of the win bonus). */
export type RangePosition = 'below' | 'low' | 'mid' | 'high' | 'above'

export interface ExpectedFightTerms {
  /** Where the offer sits against the range, null with no offer. */
  position: RangePosition | null
  confidence: ConfidenceReport
  purse: Range
  winBonus: Range
  location: string
  timing: string
  stake: string
  assessment: Assessment
  /** Set when the guardrails limited the market figure (the fight cannot carry what the market says). */
  economics: string | null
  note: string
}

/** Expected terms for a bout with `fight.sideB` (the opponent's camp). */
export function expectedFightTerms(state: GameState, fightId: Id, offer?: FightOffer | null): ExpectedFightTerms | null {
  const fight = state.fights[fightId]
  if (!fight) return null
  const opp = state.fighters[fight.sideB.fighterId], me = state.fighters[fight.sideA.fighterId]
  if (!opp || !me) return null
  const conf = confidenceFor(state, opp.id)
  const ev = fight.eventId ? state.events[fight.eventId] : undefined
  const ctx = contextFor(state, fight, 1, ev, eventRevenueMid(state, ev))
  const mvOpp = careerValue(state, opp), mvMe = careerValue(state, me)
  const b = purseBounds(mvOpp, mvMe, ctx)
  const pub = boundedPurse(mvOpp, mvMe, ctx)
  const quarter = Math.floor(state.today / 91)
  const centre = shifted(pub, fightAsk(state, fight).purseB, conf, state.seed, opp.id, 'fpurse', quarter)
  const half = HALF[conf.level]
  const purse = range(centre, half)
  const winBonus = range(centre * 0.1, half + 0.05)
  const told = toldTags(state, fight.id)
  const toldOpp = toldTags(state, opp.id)
  const mgr = managerOf(state, opp)
  const location = toldOpp.includes('location') || conf.level === 'HIGH' ? (mgr.weights.exposure > 0.6 ? 'Prefers a big stage' : mgr.weights.security > 0.6 ? 'Prefers home ground' : 'Flexible') : 'Unknown'
  const timing = told.includes('timing') || toldOpp.includes('timing') || conf.level === 'HIGH' ? (mgr.weights.activity > 0.6 ? 'Wants it soon' : 'Flexible') : 'Unknown'
  let assessment: Assessment = 'Not yet judged'
  let position: RangePosition | null = null
  if (offer) {
    const have = offer.purseB + 0.55 * offer.winBonusB
    const loV = purse.lo + 0.55 * winBonus.lo, hiV = purse.hi + 0.55 * winBonus.hi
    const ratio = have / Math.max(1, (loV + hiV) / 2)
    assessment = ratio >= 1.12 ? 'Generous offer' : ratio >= 0.93 ? 'Reasonable offer' : ratio >= 0.8 ? 'Light offer' : 'Lowball'
    // The verdict must never contradict the range printed beside it: money inside the going range is never called light or a lowball.
    position = have < loV ? 'below' : have > hiV ? 'above' : have < loV + (hiV - loV) / 3 ? 'low' : have > hiV - (hiV - loV) / 3 ? 'high' : 'mid'
    if (position !== 'below' && (assessment === 'Light offer' || assessment === 'Lowball')) assessment = 'Reasonable offer'
    if (position === 'below' && assessment === 'Reasonable offer') assessment = 'Light offer'
  }
  const stake = ctx.kind === 'standard' ? 'Standard bout' : ctx.kind === 'eliminator' ? 'Eliminator' : ctx.kind === 'unification' ? 'Unification' : 'Title fight'
  const economics = b.limited === 'ceiling' ? 'The show cannot carry a purse that high — expect them to want a bigger event.' : b.limited === 'floor' ? 'On this card they would expect a bigger share than a journeyman’s purse.' : null
  return { confidence: conf, purse, winBonus, location, timing, stake, assessment, position, economics, note: conf.level === 'LOW' ? 'You do not know this camp yet.' : conf.level === 'MODERATE' ? 'Some sense of where they stand.' : 'You know this camp well.' }
}
