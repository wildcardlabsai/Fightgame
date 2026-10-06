/**
 * Read-only helpers for the UI: prices, previews and negotiation status. Everything here is derived
 * from public information, the player's own state or the player's own offers — never from the
 * fighter's hidden ask, personality or true attributes.
 */
import { playerRosterCap } from './tiers'
import { BALANCE as B } from './balance'
import { weeksBetween } from './calendar'
import { getCounterFor, offerSummaryOf, suggestedOffer } from './negotiation'
import { releaseCost } from './roster'
import { expectedAccuracy, reportCost, searchCost, activeOps, DEPTH_BLURB, DEPTH_LABEL } from './scouting'
import { player } from './selectors'
import type { Contract, GameState, Id, NegotiationKind, NegotiationRound, Offer, Scout, ScoutDepth } from './types'
import { availabilityFor } from './market'

export interface ReportQuote {
  depth: ScoutDepth
  label: string
  blurb: string
  cost: number
  weeks: number
  /** Typical ± error (rating points) on a physical trait. */
  accuracy: number
  affordable: boolean
}

export function quoteReports(state: GameState, fighterId: Id, scoutId: Id): ReportQuote[] {
  const f = state.fighters[fighterId]
  const scout = state.scouts.find((s) => s.id === scoutId)
  if (!f || !scout) return []
  return (['basic', 'standard', 'deep'] as ScoutDepth[]).map((depth) => {
    const cost = reportCost(f, depth, scout, state.today)
    return {
      depth, label: DEPTH_LABEL[depth], blurb: DEPTH_BLURB[depth], cost, weeks: B.scouting.reportWeeks[depth],
      accuracy: expectedAccuracy(f, depth, scout, state.today), affordable: player(state).cash >= cost,
    }
  })
}

export interface ScoutView {
  id: Id
  name: string
  qualityLabel: string
  experienceLabel: string
  regions: string[]
  weeklyWage: number
  reportsDone: number
  active: number
  capacity: number
}

const level = (n: number, labels: string[]) => labels[Math.min(labels.length - 1, Math.floor(n / (100 / labels.length)))]

export function scoutViews(state: GameState): ScoutView[] {
  return state.scouts.map((s: Scout) => ({
    id: s.id, name: s.name,
    qualityLabel: level(s.quality, ['Poor', 'Modest', 'Competent', 'Sharp', 'Elite']),
    experienceLabel: level(s.experience, ['Rookie', 'Developing', 'Seasoned', 'Veteran']),
    regions: s.regionKnowledge, weeklyWage: s.weeklyWage, reportsDone: s.reportsDone,
    active: activeOps(state, s.id).length, capacity: B.scouting.maxActivePerScout,
  }))
}

export function quoteSearch(level: 'regional' | 'wide') {
  return { cost: searchCost(level), weeks: B.scouting.search[level].weeks, found: B.scouting.search[level].found }
}

export interface OpView {
  id: Id
  kind: 'report' | 'search'
  title: string
  fighterId?: Id
  weeksLeft: number
  totalWeeks: number
  status: 'active' | 'done'
  summary?: string
  cost: number
  scoutName: string
}

export function opViews(state: GameState): OpView[] {
  return state.scoutOps.map((o) => ({
    id: o.id, kind: o.kind,
    title: o.kind === 'report'
      ? `${DEPTH_LABEL[o.depth!]} — ${state.fighters[o.fighterId!]?.firstName ?? ''} ${state.fighters[o.fighterId!]?.lastName ?? ''}`
      : `Talent search (${o.search!.level})`,
    fighterId: o.fighterId,
    weeksLeft: Math.max(0, weeksBetween(state.today, o.completeDay)),
    totalWeeks: weeksBetween(o.startDay, o.completeDay),
    status: o.status, summary: o.summary, cost: o.cost,
    scoutName: state.scouts.find((s) => s.id === o.scoutId)?.name ?? 'Scout',
  }))
}

// ------------------------------------------------------------ Negotiation

export interface NegotiationInfo {
  kind: NegotiationKind
  /** What the fighter's camp has said so far (rounds the player has initiated). */
  rounds: NegotiationRound[]
  counter: Offer | null
  status: 'none' | 'open' | 'broken'
  patience: 'Patient' | 'Cooling' | 'Running out of patience' | null
  suggested: Offer
  canNegotiate: boolean
  blockedReason: string | null
  rosterCount: number
  rosterCap: number
  cash: number
}

export function negotiationInfo(state: GameState, fighterId: Id, kind: NegotiationKind): NegotiationInfo | null {
  const f = state.fighters[fighterId]
  if (!f) return null
  const p = player(state)
  const neg = state.negotiations[fighterId]
  const rosterCount = Object.values(state.contracts).filter((c) => c.promotionId === p.id).length
  let blockedReason: string | null = null
  if (kind === 'signing') {
    const av = availabilityFor(state, f)
    if (!av.signable) blockedReason = av.reason ?? 'Unavailable'
  } else {
    const c = f.contractId ? state.contracts[f.contractId] : null
    if (!c || c.promotionId !== p.id) blockedReason = 'Not on your roster'
    else if (weeksBetween(state.today, c.endDay) > B.contracts.approachingWeeks) blockedReason = 'Renewal talks open six months before the contract ends'
  }
  return {
    kind, rounds: neg?.rounds ?? [], counter: neg ? getCounterFor(neg) : null,
    status: neg ? neg.status : 'none',
    patience: neg ? (neg.patience >= 3 ? 'Patient' : neg.patience >= 2 ? 'Cooling' : 'Running out of patience') : null,
    suggested: suggestedOffer(state, f, kind), canNegotiate: blockedReason === null,
    blockedReason, rosterCount, rosterCap: playerRosterCap(p.tier), cash: p.cash,
  }
}

export function offerSummary(offer: Offer) {
  return offerSummaryOf(offer)
}

// ---------------------------------------------------------------- Contracts

function ownContracts(state: GameState): Contract[] {
  return Object.values(state.contracts).filter((c) => c.promotionId === state.playerPromotionId)
}

export interface PastContract { id: Id; fighterId: Id; endDay: number; weeklyRetainer: number; basePurse: number; status: string }

export function ownContractHistory(state: GameState): PastContract[] {
  return state.contractHistory
    .filter((c) => c.promotionId === state.playerPromotionId)
    .map((c) => ({ id: c.id, fighterId: c.fighterId, endDay: c.endDay, weeklyRetainer: c.weeklyRetainer, basePurse: c.basePurse, status: c.status }))
}

export interface Commitments {
  weeklyRetainers: number
  guaranteedPurses: number
  count: number
}

export function commitments(state: GameState): Commitments {
  const own = ownContracts(state)
  return {
    weeklyRetainers: own.reduce((n, c) => n + c.weeklyRetainer, 0),
    guaranteedPurses: own.reduce((n, c) => n + c.fightsRemaining * c.basePurse, 0),
    count: own.length,
  }
}

export function releaseQuote(state: GameState, fighterId: Id): { fee: number; affordable: boolean } | null {
  const f = state.fighters[fighterId]
  const c = f?.contractId ? state.contracts[f.contractId] : null
  if (!c || c.promotionId !== state.playerPromotionId) return null
  const fee = releaseCost(state, c)
  return { fee, affordable: player(state).cash >= fee }
}

/** Public news feed items the player has seen — no hidden info beyond what's already in the text. */
export function recentSpend(state: GameState, category: string, weeks = 52): number {
  const cutoff = state.today - weeks * 7
  return -state.ledger.filter((t) => t.category === category && t.day > cutoff).reduce((n, t) => n + t.amount, 0)
}
