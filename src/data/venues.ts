export interface VenueSeed {
  name: string
  city: string
  country: string
  capacity: number
  hireCost: number
  prestige: number
}

/** Fictionalised venue list. Capacity/cost bands mirror the real ladder from leisure centres to stadiums. */
export const VENUE_SEEDS: VenueSeed[] = [
  { name: 'Ironworks Social Club', city: 'Sheffield', country: 'ENG', capacity: 450, hireCost: 2_500, prestige: 1 },
  { name: 'Dockside Leisure Centre', city: 'Liverpool', country: 'ENG', capacity: 900, hireCost: 5_000, prestige: 1 },
  { name: 'The Rialto Ballroom', city: 'Leeds', country: 'ENG', capacity: 1_400, hireCost: 9_000, prestige: 2 },
  { name: 'Aston Exhibition Hall', city: 'Birmingham', country: 'ENG', capacity: 2_200, hireCost: 16_000, prestige: 2 },
  { name: 'Hallam Arena', city: 'Sheffield', country: 'ENG', capacity: 4_800, hireCost: 38_000, prestige: 3 },
  { name: 'Lakeside Convention Centre', city: 'Cardiff', country: 'WAL', capacity: 3_500, hireCost: 26_000, prestige: 3 },
  { name: 'Meridian Arena', city: 'Manchester', country: 'ENG', capacity: 12_500, hireCost: 95_000, prestige: 4 },
  { name: 'Thames Dome', city: 'London', country: 'ENG', capacity: 18_000, hireCost: 160_000, prestige: 5 },
  { name: 'Crown Park Stadium', city: 'London', country: 'ENG', capacity: 55_000, hireCost: 520_000, prestige: 5 },
  { name: 'Blue Ridge Casino Ballroom', city: 'Atlantic City', country: 'USA', capacity: 2_000, hireCost: 14_000, prestige: 2 },
  { name: 'Bayou Civic Centre', city: 'Houston', country: 'USA', capacity: 5_500, hireCost: 42_000, prestige: 3 },
  { name: 'Liberty Garden', city: 'New York', country: 'USA', capacity: 19_500, hireCost: 210_000, prestige: 5 },
  { name: 'Desert Star Arena', city: 'Las Vegas', country: 'USA', capacity: 20_000, hireCost: 240_000, prestige: 5 },
  { name: 'Al Waha Super Dome', city: 'Riyadh', country: 'KSA', capacity: 40_000, hireCost: 400_000, prestige: 5 },
]
