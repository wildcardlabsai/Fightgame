import type { VenueTier } from '../engine/types'

export interface VenueSeed {
  name: string
  city: string
  country: string
  capacity: number
  hireCost: number
  prestige: number
  production?: number
  market?: number
}

/** Fictionalised venue ladder from social clubs to stadiums. Rental cost rises faster than capacity. */
export const VENUE_SEEDS: VenueSeed[] = [
  { name: 'Ironworks Social Club', city: 'Sheffield', country: 'ENG', capacity: 450, hireCost: 1_200, prestige: 1, market: 0.95 },
  { name: 'Valleys Sports Centre', city: 'Merthyr', country: 'WAL', capacity: 1_100, hireCost: 3_000, prestige: 1, market: 0.6 },
  { name: 'Dockside Leisure Centre', city: 'Liverpool', country: 'ENG', capacity: 900, hireCost: 2_400, prestige: 1, market: 1.05 },
  { name: 'The Rialto Ballroom', city: 'Leeds', country: 'ENG', capacity: 1_400, hireCost: 4_500, prestige: 2, market: 1.0 },
  { name: 'Smithfield Social Hall', city: 'Dublin', country: 'IRL', capacity: 1_800, hireCost: 6_000, prestige: 2, market: 1.0 },
  { name: 'Aston Exhibition Hall', city: 'Birmingham', country: 'ENG', capacity: 2_200, hireCost: 10_200, prestige: 2, market: 1.1 },
  { name: 'Blue Ridge Casino Ballroom', city: 'Atlantic City', country: 'USA', capacity: 2_000, hireCost: 9_600, prestige: 2, market: 1.0 },
  { name: 'Silver State Theatre', city: 'Las Vegas', country: 'USA', capacity: 2_500, hireCost: 14_400, prestige: 3, market: 1.3, production: 3 },
  { name: 'Lakeside Convention Centre', city: 'Cardiff', country: 'WAL', capacity: 3_500, hireCost: 18_000, prestige: 3, market: 1.0 },
  { name: 'Brooklyn Armory Hall', city: 'New York', country: 'USA', capacity: 4_200, hireCost: 36_000, prestige: 3, market: 1.5 },
  { name: 'Hallam Arena', city: 'Sheffield', country: 'ENG', capacity: 4_800, hireCost: 33_000, prestige: 3, market: 0.95 },
  { name: 'Bayou Civic Centre', city: 'Houston', country: 'USA', capacity: 5_500, hireCost: 45_000, prestige: 3, market: 1.1 },
  { name: 'Docklands Hall', city: 'Belfast', country: 'IRL', capacity: 6_000, hireCost: 51_000, prestige: 3, market: 0.9 },
  { name: 'Capital Convention Hall', city: 'Cardiff', country: 'WAL', capacity: 9_000, hireCost: 104_000, prestige: 4, market: 1.0 },
  { name: 'Clyde Arena', city: 'Glasgow', country: 'SCO', capacity: 9_500, hireCost: 110_000, prestige: 4, market: 1.0 },
  { name: 'Meridian Arena', city: 'Manchester', country: 'ENG', capacity: 12_500, hireCost: 156_000, prestige: 4, market: 1.25 },
  { name: 'Gran Arena Tapatía', city: 'Guadalajara', country: 'MEX', capacity: 12_000, hireCost: 124_000, prestige: 4, market: 1.1 },
  { name: 'Midlands Sports Arena', city: 'Birmingham', country: 'ENG', capacity: 15_000, hireCost: 200_000, prestige: 4, market: 1.1 },
  { name: 'Thames Dome', city: 'London', country: 'ENG', capacity: 18_000, hireCost: 300_000, prestige: 5, market: 1.5 },
  { name: 'Liberty Garden', city: 'New York', country: 'USA', capacity: 19_500, hireCost: 380_000, prestige: 5, market: 1.5 },
  { name: 'Desert Star Arena', city: 'Las Vegas', country: 'USA', capacity: 20_000, hireCost: 420_000, prestige: 5, market: 1.35 },
  { name: 'Texas Star Stadium', city: 'Houston', country: 'USA', capacity: 48_000, hireCost: 860_000, prestige: 5, market: 1.1 },
  { name: 'Al Waha Super Dome', city: 'Riyadh', country: 'KSA', capacity: 40_000, hireCost: 760_000, prestige: 5, market: 1.3 },
  { name: 'Crown Park Stadium', city: 'London', country: 'ENG', capacity: 55_000, hireCost: 960_000, prestige: 5, market: 1.5 },
]

export function tierFor(capacity: number): VenueTier {
  return capacity < 1_500 ? 'local' : capacity < 5_000 ? 'regional' : capacity < 14_000 ? 'national' : capacity < 30_000 ? 'arena' : 'stadium'
}

const SIZE: Record<VenueTier, { production: number; min: number; max: number }> = {
  local: { production: 1, min: 3, max: 6 },
  regional: { production: 2, min: 4, max: 8 },
  national: { production: 3, min: 5, max: 9 },
  arena: { production: 4, min: 6, max: 10 },
  stadium: { production: 5, min: 6, max: 10 },
}

/** Fill the derived venue fields (also used when migrating old saves). */
export function venueFields(seed: VenueSeed) {
  const tier = tierFor(seed.capacity)
  const z = SIZE[tier]
  return { tier, production: seed.production ?? z.production, market: seed.market ?? 1, minFights: z.min, maxFights: z.max }
}
