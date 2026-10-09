/**
 * The promoter's office commands: pure `(state, ...args) => { ok, error?, state }`, validating against the game's rules and returning a
 * new state (or the old one untouched on failure). The UI never edits state directly.
 */
import { post } from '../ledger'
import type { GameState, Id } from '../types'
import { clearGoal, setGoal } from './goals'
import * as offers from './offers'
import { setCampaign } from './promotion'
import { resolveReview } from './reviews'
import { officeOf } from './state'
import { setStrategy } from './strategy'
import { COACH, coachWeekly } from './trainer'
import type { CampaignKind, CoachLevel, GoalKind, OfferTerms, StrategyFocus, StrategyStance } from './types'

export interface OfficeOutcome { ok: boolean; error?: string; state: GameState; needsOverride?: boolean; fightId?: Id }

const run = (input: GameState, fn: (s: GameState) => { ok: boolean; error?: string }): OfficeOutcome => {
  const state = structuredClone(input)
  const r = fn(state)
  return { ...r, state: r.ok ? state : input }
}

export const acceptIncomingOffer = (s: GameState, id: Id, override = false): OfficeOutcome => offers.acceptOffer(s, id, override)
export const rejectIncomingOffer = (s: GameState, id: Id): OfficeOutcome => offers.rejectOffer(s, id)
export const counterIncomingOffer = (s: GameState, id: Id, terms: OfferTerms): OfficeOutcome => offers.counterOffer(s, id, terms)
export const withdrawOfferCounter = (s: GameState, id: Id): OfficeOutcome => offers.withdrawCounter(s, id)
export const pullOutOfAgreedOffer = (s: GameState, id: Id): OfficeOutcome => offers.pullOutOfOffer(s, id)

export const chooseGoal = (s: GameState, fighterId: Id, kind: GoalKind | null): OfficeOutcome =>
  run(s, (st) => (kind === null ? (clearGoal(st, fighterId), { ok: true }) : setGoal(st, fighterId, kind)))

export const chooseCampaign = (s: GameState, eventId: Id, kind: CampaignKind): OfficeOutcome => run(s, (st) => setCampaign(st, eventId, kind))

export const chooseStrategy = (s: GameState, focus: StrategyFocus | null, stance: StrategyStance | null): OfficeOutcome =>
  run(s, (st) => (setStrategy(st, focus, stance) ? { ok: true } : { ok: false, error: 'That is already your direction.' }))

/** Hire a better coaching staff (six weeks of its cost up front) or let it go back down (free). The trainers still decide the work. */
export const chooseCoaching = (s: GameState, level: CoachLevel): OfficeOutcome =>
  run(s, (st) => {
    const o = officeOf(st)
    if (o.coach === level) return { ok: false, error: 'That is already your coaching staff.' }
    const up = COACH[level].weekly > COACH[o.coach].weekly
    const fee = up ? coachWeekly(st, level) * 6 : 0
    if (fee > st.promotions[st.playerPromotionId].cash) return { ok: false, error: `You cannot afford the £${fee.toLocaleString('en-GB')} it takes to bring them in.` }
    if (fee > 0) post(st, 'coaching', -fee, `Hiring — ${COACH[level].label}`)
    o.coach = level
    return { ok: true }
  })

/** Answer a post-fight decision (see reviews.ts). The rematch choice opens the ordinary fight negotiation. */
export const answerReview = (input: GameState, id: Id, choice: string): OfficeOutcome => {
  const state = structuredClone(input)
  const r = resolveReview(state, id, choice)
  return { ...r, state: r.ok ? state : input }
}

export const OFFICE_COMMANDS = {
  accept: acceptIncomingOffer, reject: rejectIncomingOffer, counter: counterIncomingOffer, withdrawCounter: withdrawOfferCounter, pullOut: pullOutOfAgreedOffer,
  review: answerReview, goal: chooseGoal, campaign: chooseCampaign, strategy: chooseStrategy, coaching: chooseCoaching,
} as const
export type OfficeCmd = keyof typeof OFFICE_COMMANDS
