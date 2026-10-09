/**
 * THE PROMOTER'S OFFICE (Phase 5.4C): the small amount of persistent state the promoter's business layer needs on top of the existing
 * fights, contracts, events, media and business records: incoming proposals, career objectives, the relationship book, event campaigns,
 * the chosen strategy and coaching staff. Everything else (milestone progress, readiness, rivalries' history) is derived.
 */
import type { Day, Id } from '../types'

// ---------------------------------------------------------------- Incoming fight offers

export type OfferReason = 'development' | 'competitive' | 'commercial' | 'eliminator' | 'title' | 'rematch' | 'replacement' | 'rivalry' | 'regional' | 'opportunity'
export type OfferStatus = 'open' | 'countered' | 'agreed' | 'rejected' | 'expired' | 'withdrawn'

/** Money for the bout, in the currency the host pays it in: the purse of the visitor, a fee to the other promotion, a win bonus. */
export interface OfferTerms {
  /** What the player's fighter earns for the fight (host 'them': the fee the rival pays; host 'you': what the player pays their man). */
  purse: number
  winBonus: number
  rematch: boolean
}

export interface OfferRound { day: Day; by: 'rival' | 'you'; terms: OfferTerms; note: string }

export interface FightProposal {
  id: Id
  /** The promotion that sent it. */
  promoId: Id
  /** The player's fighter and the rival's fighter. */
  mine: Id
  theirs: Id
  reason: OfferReason
  /** Who stages the fight: 'you' (a bout for your own show) or 'them' (your fighter joins their show). */
  host: 'you' | 'them'
  /** For host 'them': the rival event the fight would join (date and venue come from it). */
  eventId: Id | null
  day: Day | null
  rounds: number
  stakes: 'standard' | 'eliminator' | 'title'
  terms: OfferTerms
  status: OfferStatus
  createdDay: Day
  expiresDay: Day
  /** The fight record once agreed. */
  fightId: Id | null
  /** Negotiation history, newest last (bounded). */
  history: OfferRound[]
  /** One line of public context for the player (never a calculation). */
  message: string
  /** Why it ended, in words (rejected / expired / withdrawn). */
  closed?: string
  closedDay?: Day
}

// ---------------------------------------------------------------- Career objectives

export type GoalKind = 'prospect' | 'regional' | 'domestic' | 'european' | 'world' | 'rebuild' | 'return' | 'headline' | 'veteran'
export interface CareerGoal { kind: GoalKind; set: Day }
export interface CareerDecision { day: Day; text: string }

// ---------------------------------------------------------------- Relationships

export interface RelReason { day: Day; delta: number; why: string }
export interface Relation { v: number; log: RelReason[] }

// ---------------------------------------------------------------- Event campaigns

export type CampaignKind = 'traditional' | 'prestige' | 'rivalry' | 'showcase' | 'local' | 'headline'
export interface Campaign { kind: CampaignKind; set: Day; /** Budget committed through the event's own marketing line (kept here for the report). */ budget: number }

// ---------------------------------------------------------------- Strategy and staff

export type StrategyFocus = 'prospects' | 'regional' | 'contender' | 'headline'
export type StrategyStance = 'growth' | 'stability' | 'prestige'
export type CoachLevel = 'standard' | 'quality' | 'elite'

/** `null` = not chosen yet: no effect either way (a new career, and every migrated save, starts undirected). */
export interface Strategy { focus: StrategyFocus | null; stance: StrategyStance | null; since: Day; changes: number }

/** Phase 5.4D: a decision that a significant result genuinely opens up. Created from an authoritative result, resolved once, lapses without penalty. */
export type ReviewKind = 'breakout' | 'setback' | 'rematch'
export interface CareerReview {
  id: Id; kind: ReviewKind; fighterId: Id; oppId: Id; fightId: Id; createdDay: Day; expiresDay: Day
  status: 'open' | 'resolved' | 'lapsed'; choice?: string; closedDay?: Day
}

export interface OfficeState {
  v: 1
  /** Own id counter: this layer never touches the engine's id counter or RNG. */
  n: number
  offers: Record<Id, FightProposal>
  goals: Record<Id, CareerGoal>
  decisions: Record<Id, CareerDecision[]>
  /** `${category}:${id}` -> relationship of the player's promotion with that counterpart. */
  rel: Record<string, Relation>
  /** Keys of relationship events already applied (a bounded ring): the guard against applying the same effect twice. */
  applied: string[]
  campaigns: Record<Id, Campaign>
  strategy: Strategy
  coach: CoachLevel
  /** Why a rivalry exists, by sorted fighter pair (bounded). */
  rivalNotes: Record<string, { day: Day; why: string }[]>
  /** Offers made by each rival promotion lately (fighter pair keys -> day): no repeated proposals without a reason. */
  recent: Record<string, Day>
  /** Phase 5.4D: post-fight decisions (bounded). Absent in saves written before 5.4D; read as empty. */
  reviews?: Record<Id, CareerReview>
}

export const OFFICE_LIMITS = { offers: 36, decisions: 6, rel: 60, relLog: 5, applied: 90, rivalNotes: 24, recent: 80, openOffers: 4, reviewsLive: 6, reviewsKept: 14 }

export function emptyOffice(): OfficeState {
  return { v: 1, n: 0, offers: {}, goals: {}, decisions: {}, rel: {}, applied: [], campaigns: {}, strategy: { focus: null, stance: null, since: 0, changes: 0 }, coach: 'standard', rivalNotes: {}, recent: {} }
}
