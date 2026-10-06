/**
 * STANDING SPONSOR CATALOG (Phase 4.6c) — data only. Each entry is a company that can become the official partner of
 * the PLAYER's promotion. Per-event sponsorship (`events.ts`) is a separate, additional layer.
 *
 * Money (all £): `annual` is paid in four quarterly instalments; `perEvent` is paid for each qualifying show;
 * a sell-out adds `bonusShare` of the per-event fee. The three contract lengths scale the annual value (loyalty premium),
 * but the terms are fixed for the length of the deal — a sponsor signed for three years does not pay more if you boom.
 * Exclusivity: one active deal per `industry`.
 */
import type { PromotionTier, VenueTier } from './types'

export interface SponsorDef {
  id: string
  name: string
  industry: string
  /** 1 (local) … 5 (global). Matches `TierDef.sponsorTier`. */
  tier: 1 | 2 | 3 | 4 | 5
  minPromotionTier: PromotionTier
  minReputation: number
  minFanbase: number
  annual: number
  perEvent: number
  /** Qualifying shows needed per contract year. */
  minEvents: number
  /** A show only counts if held in at least this size of venue… */
  minVenue: VenueTier
  /** …and drew at least this many people. */
  minAudience: number
  /** Share of the per-event fee added for a sell-out (≥85% full). */
  bonusShare: number
  /** Extra marketing effectiveness for the promotion while this deal is active (fraction, e.g. 0.05 = +5%). */
  marketingBonus?: number
  pitch: string
}

export const SPONSOR_CATALOG: SponsorDef[] = [
  // ---- 1: local
  { id: 'ironside', name: 'Ironside Gym Supplies', industry: 'fitness', tier: 1, minPromotionTier: 'Startup', minReputation: 5, minFanbase: 1_000, annual: 20_000, perEvent: 1_500, minEvents: 4, minVenue: 'local', minAudience: 150, bonusShare: 0.5, pitch: 'a local fitness retailer that wants its name on the ring apron' },
  { id: 'cornerstone', name: 'Cornerstone Coffee', industry: 'food', tier: 1, minPromotionTier: 'Startup', minReputation: 5, minFanbase: 1_000, annual: 16_000, perEvent: 1_200, minEvents: 4, minVenue: 'local', minAudience: 150, bonusShare: 0.5, pitch: 'a regional café chain looking for match-night footfall' },
  // ---- 2: regional
  { id: 'knockout', name: 'Knockout Energy', industry: 'energy', tier: 2, minPromotionTier: 'Regional', minReputation: 18, minFanbase: 8_000, annual: 70_000, perEvent: 5_000, minEvents: 6, minVenue: 'regional', minAudience: 600, bonusShare: 0.5, marketingBonus: 0.05, pitch: 'an energy-drink brand that will co-fund your campaigns' },
  { id: 'steelhouse', name: 'Steelhouse Insurance', industry: 'finance', tier: 2, minPromotionTier: 'Regional', minReputation: 20, minFanbase: 10_000, annual: 85_000, perEvent: 6_000, minEvents: 6, minVenue: 'regional', minAudience: 700, bonusShare: 0.4, pitch: 'a regional insurer that likes steady, reliable partners' },
  { id: 'northlink', name: 'NorthLink Mobile', industry: 'telecom', tier: 2, minPromotionTier: 'Regional', minReputation: 22, minFanbase: 12_000, annual: 65_000, perEvent: 4_500, minEvents: 6, minVenue: 'regional', minAudience: 700, bonusShare: 0.5, pitch: 'a mobile network targeting your growing local audience' },
  // ---- 3: national
  { id: 'apex', name: 'Apex Financial', industry: 'finance', tier: 3, minPromotionTier: 'National', minReputation: 38, minFanbase: 60_000, annual: 250_000, perEvent: 20_000, minEvents: 8, minVenue: 'national', minAudience: 2_000, bonusShare: 0.4, pitch: 'a national bank that wants to be your official financial partner' },
  { id: 'volt', name: 'Volt Sportswear', industry: 'apparel', tier: 3, minPromotionTier: 'National', minReputation: 38, minFanbase: 60_000, annual: 220_000, perEvent: 18_000, minEvents: 8, minVenue: 'national', minAudience: 2_000, bonusShare: 0.5, pitch: 'an apparel brand ready to dress your fighters' },
  { id: 'broadside', name: 'Broadside Media', industry: 'media', tier: 3, minPromotionTier: 'National', minReputation: 40, minFanbase: 80_000, annual: 200_000, perEvent: 15_000, minEvents: 8, minVenue: 'national', minAudience: 2_500, bonusShare: 0.5, marketingBonus: 0.05, pitch: 'a media group that will promote your shows across its channels' },
  // ---- 4: international
  { id: 'meridian', name: 'Meridian Motors', industry: 'automotive', tier: 4, minPromotionTier: 'Major', minReputation: 60, minFanbase: 450_000, annual: 800_000, perEvent: 60_000, minEvents: 8, minVenue: 'arena', minAudience: 6_000, bonusShare: 0.4, pitch: 'a global carmaker looking for a premium sporting property' },
  { id: 'orbit', name: 'Orbit Telecom', industry: 'telecom', tier: 4, minPromotionTier: 'Major', minReputation: 60, minFanbase: 450_000, annual: 700_000, perEvent: 50_000, minEvents: 8, minVenue: 'arena', minAudience: 6_000, bonusShare: 0.5, pitch: 'an international operator that wants your fight nights on its network' },
  { id: 'crown', name: 'Crown & Co Watches', industry: 'luxury', tier: 4, minPromotionTier: 'Major', minReputation: 62, minFanbase: 500_000, annual: 900_000, perEvent: 55_000, minEvents: 8, minVenue: 'arena', minAudience: 7_000, bonusShare: 0.4, pitch: 'a luxury house that wants ringside prestige' },
  // ---- 5: global
  { id: 'globalsport', name: 'Global Sport', industry: 'apparel', tier: 5, minPromotionTier: 'Global', minReputation: 78, minFanbase: 2_000_000, annual: 3_000_000, perEvent: 150_000, minEvents: 10, minVenue: 'arena', minAudience: 12_000, bonusShare: 0.4, pitch: 'the world’s biggest sportswear brand, ready to make you its flagship boxing partner' },
  { id: 'atlas', name: 'Atlas Bank', industry: 'finance', tier: 5, minPromotionTier: 'Global', minReputation: 78, minFanbase: 2_000_000, annual: 2_600_000, perEvent: 130_000, minEvents: 10, minVenue: 'arena', minAudience: 12_000, bonusShare: 0.4, pitch: 'a global bank that wants its name on every card' },
  { id: 'halo', name: 'Halo Energy', industry: 'energy', tier: 5, minPromotionTier: 'Global', minReputation: 80, minFanbase: 2_500_000, annual: 2_200_000, perEvent: 110_000, minEvents: 10, minVenue: 'arena', minAudience: 12_000, bonusShare: 0.5, marketingBonus: 0.08, pitch: 'a worldwide energy brand with a huge marketing budget to share' },
]

export const sponsorDef = (id: string): SponsorDef | undefined => SPONSOR_CATALOG.find((s) => s.id === id)

/** Contract length → multiplier on the annual value. Longer deals pay a little more per year but lock the price in. */
export const LENGTH_MULT: Record<1 | 2 | 3, number> = { 1: 1, 2: 1.05, 3: 1.1 }
export const SPONSOR_LENGTHS: (1 | 2 | 3)[] = [1, 2, 3]

/** Extra marketing effectiveness from the player's active standing deals (0 when none). Kept here so demand code needs no sponsor logic. */
export function marketingBonus(state: { sponsors?: { deals: { sponsorId: string; status: string }[] } }, promotionIsPlayer: boolean): number {
  if (!promotionIsPlayer || !state.sponsors) return 0
  let n = 0
  for (const d of state.sponsors.deals) if (d.status === 'active') n += sponsorDef(d.sponsorId)?.marketingBonus ?? 0
  return Math.min(0.15, n)
}
