/**
 * REAL-WORLD VENUE DATA — definition. All real venue facts live in `src/data/realVenues/*.ts`; no UI component or engine rule
 * carries a venue name. Researched facts (name, location, capacity, boxing capacity, indoor/roof, coordinates) are separated
 * from GAME ABSTRACTIONS (prestige, production, market sizes, suitability), which are modelling judgements, not facts.
 *
 * Nothing here claims an affiliation with, or endorsement by, any venue, promoter, broadcaster or sanctioning body.
 */
export type VerificationStatus = 'verified' | 'approximate' | 'unverified'

export interface VenueSource { url: string; note?: string }

export interface RealVenueDefinition {
  /** Stable id, `rv_` + snake_case of the current name. Never reused when a venue is renamed. */
  id: string
  /** Current official name at the time of research. */
  name: string
  /** Former / alternative names (a renamed venue is ONE entry, not two). */
  aliases?: string[]
  city: string
  /** Game nation key where one exists (ENG, SCO, WAL, IRL, USA, MEX, GER, AUS, JPN …), otherwise a 3-letter code (KSA, UAE, ESP, FRA, ITA, NED, CAN, …). */
  country: string
  countryName: string
  /** Region within the country, e.g. 'London', 'South Wales', 'Nevada'. */
  region: string
  latitude: number
  longitude: number
  /** Maximum published capacity (any configuration). */
  capacity: number
  /** Capacity in a boxing configuration (ring + floor seating). Equal to a published figure only when `boxingCapacitySource` is 'published'. */
  boxingCapacity: number
  boxingCapacitySource: 'published' | 'estimated'
  kind: 'hall' | 'leisure_centre' | 'theatre' | 'casino' | 'exhibition' | 'arena' | 'stadium'
  indoor: boolean
  roof: 'fixed' | 'retractable' | 'none'
  /** Game abstractions (1–5 unless stated) — modelling judgements, NOT researched facts. */
  prestige: number
  production: number
  broadcastSuitability: number
  ppvSuitability: number
  /** Audience pools (0.4–1.8): local city, national, international pull of an event here. */
  market: { local: number; national: number; international: number }
  /** How established boxing is at this venue: documented boxing events in the past, or just plausible. */
  boxingHistory: 'major' | 'regular' | 'occasional' | 'none'
  sources: VenueSource[]
  verificationStatus: VerificationStatus
  /** ISO date the facts were last checked. */
  checked: string
  notes?: string
}
