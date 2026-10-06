/**
 * PROMOTION TIERS (Phase 4.6c) — the single data table for how a promotion grows.
 *
 * Internal ids stay as they were (`Startup`, `Regional`, `National`, `Major`, `Global`) so saves and the rival
 * promotions keep working; the player-facing names are `label` below (Local, Regional, National, International, Global).
 * Everything tier-dependent for the PLAYER — roster cap, which venues can be booked, what a tier unlocks, what it takes
 * to reach the next one — is read from here. Rivals keep their own caps (`balance.ts`) and are never gated.
 *
 * This module is pure data + tiny helpers with no engine imports beyond types, so market/roster/quotes can use it
 * without circular imports. Progression logic (which needs finances) lives in `tierProgress.ts`.
 */
import type { PromotionTier, Promotion, VenueTier } from './types'

export type FinanceGate = 'any' | 'notCritical' | 'healthy'

export interface TierRequirements {
  reputation: number
  fanbase: number
  /** Completed events as a promoter. */
  events: number
  /** Lifetime event revenue (£). */
  revenue: number
  /** Largest crowd you have drawn. */
  bestAttendance: number
  /** Fighters on your roster at or above this public reputation. */
  established: { count: number; minReputation: number }
  /** Financial health the promotion must be in. */
  finance: FinanceGate
  /** Optional cash in the bank. */
  cash: number
}

export interface TierDef {
  id: PromotionTier
  /** Player-facing name. */
  label: string
  rank: number
  blurb: string
  rosterCap: number
  /** Venue tiers the player may book at this level. */
  venues: VenueTier[]
  /** Broadcast kinds that open up at this level (in addition to reputation gates). */
  broadcasts: ('localTv' | 'nationalTv' | 'streaming' | 'ppv')[]
  /** Highest standing-sponsor tier (1–5) that will talk to you. */
  sponsorTier: number
  /** Standing sponsors you can hold at once. */
  sponsorSlots: number
  /** What reaching this tier unlocks, in words (used by the tier-up notice). */
  unlocks: string[]
  /** What it takes to reach this tier from the previous one (null for the first). */
  requires: TierRequirements | null
}

export const TIER_DEFS: Record<PromotionTier, TierDef> = {
  Startup: {
    id: 'Startup', label: 'Local', rank: 0, blurb: 'A small local promotion: club shows, a gym and a handful of fighters.',
    rosterCap: 10, venues: ['local', 'regional'], broadcasts: ['localTv'], sponsorTier: 1, sponsorSlots: 1,
    unlocks: ['Local halls and regional venues', 'Local TV', 'Small local sponsors'], requires: null,
  },
  Regional: {
    id: 'Regional', label: 'Regional', rank: 1, blurb: 'An established regional promoter with a following and a real roster.',
    rosterCap: 18, venues: ['local', 'regional', 'national'], broadcasts: ['localTv', 'nationalTv', 'streaming'], sponsorTier: 2, sponsorSlots: 2,
    unlocks: ['Roster capacity 18', 'National venues (3,500–6,000 seats)', 'National TV and streaming deals', 'Regional sponsors'],
    requires: { reputation: 16, fanbase: 8_000, events: 5, revenue: 100_000, bestAttendance: 0, established: { count: 0, minReputation: 0 }, finance: 'notCritical', cash: 0 },
  },
  National: {
    id: 'National', label: 'National', rank: 2, blurb: 'A major domestic promotion: arenas, national television and real sponsorship.',
    rosterCap: 28, venues: ['local', 'regional', 'national', 'arena'], broadcasts: ['localTv', 'nationalTv', 'streaming', 'ppv'], sponsorTier: 3, sponsorSlots: 3,
    unlocks: ['Roster capacity 28', 'Arena access (9,000+ seats)', 'Pay-per-view becomes available', 'National sponsors'],
    requires: { reputation: 36, fanbase: 60_000, events: 20, revenue: 1_500_000, bestAttendance: 2_000, established: { count: 2, minReputation: 40 }, finance: 'notCritical', cash: 0 },
  },
  Major: {
    id: 'Major', label: 'International', rank: 3, blurb: 'A major international promotion with overseas reach and elite talent.',
    rosterCap: 40, venues: ['local', 'regional', 'national', 'arena'], broadcasts: ['localTv', 'nationalTv', 'streaming', 'ppv'], sponsorTier: 4, sponsorSlots: 4,
    unlocks: ['Roster capacity 40', 'International sponsors', 'Elite fighters take your calls'],
    requires: { reputation: 58, fanbase: 450_000, events: 45, revenue: 12_000_000, bestAttendance: 8_000, established: { count: 4, minReputation: 55 }, finance: 'healthy', cash: 1_500_000 },
  },
  Global: {
    id: 'Global', label: 'Global', rank: 4, blurb: 'The top of the sport: stadium nights, major PPV and a worldwide audience.',
    rosterCap: 60, venues: ['local', 'regional', 'national', 'arena', 'stadium'], broadcasts: ['localTv', 'nationalTv', 'streaming', 'ppv'], sponsorTier: 5, sponsorSlots: 5,
    unlocks: ['Roster capacity 60', 'Stadium events', 'Global sponsorship'],
    requires: { reputation: 78, fanbase: 2_000_000, events: 90, revenue: 60_000_000, bestAttendance: 18_000, established: { count: 7, minReputation: 65 }, finance: 'healthy', cash: 8_000_000 },
  },
}

export const TIER_SEQUENCE: PromotionTier[] = ['Startup', 'Regional', 'National', 'Major', 'Global']

export const tierDef = (id: PromotionTier): TierDef => TIER_DEFS[id]
export const tierLabel = (id: PromotionTier): string => TIER_DEFS[id].label
export const nextTierId = (id: PromotionTier): PromotionTier | null => TIER_SEQUENCE[TIER_DEFS[id].rank + 1] ?? null
export const prevTierId = (id: PromotionTier): PromotionTier | null => TIER_SEQUENCE[TIER_DEFS[id].rank - 1] ?? null

/** Player roster capacity comes from the tier table. Rivals keep `balance.ts` caps (passed in by the caller). */
export function playerRosterCap(tier: PromotionTier): number {
  return TIER_DEFS[tier].rosterCap
}

export function tierAllowsVenue(tier: PromotionTier, venue: VenueTier): boolean {
  return TIER_DEFS[tier].venues.includes(venue)
}

/** The lowest tier that may book a venue tier (for "needs X promotion" messages). */
export function tierNeededForVenue(venue: VenueTier): PromotionTier {
  return TIER_SEQUENCE.find((t) => TIER_DEFS[t].venues.includes(venue)) ?? 'Global'
}

export function tierAllowsBroadcast(tier: PromotionTier, kind: 'localTv' | 'nationalTv' | 'streaming' | 'ppv'): boolean {
  return TIER_DEFS[tier].broadcasts.includes(kind)
}

export const isPlayerPromotion = (p: Pick<Promotion, 'isPlayer'>): boolean => p.isPlayer
