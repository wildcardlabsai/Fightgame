import { AMERICAS_VENUES } from './americas'
import { UK_VENUES } from './uk'
import { WORLD_VENUES } from './world'
import type { RealVenueDefinition } from './types'

export type { RealVenueDefinition, VerificationStatus, VenueSource } from './types'

/** Every real venue in the game, sorted by id. A renamed building is one entry (old names in `aliases`). */
export const REAL_VENUES: RealVenueDefinition[] = [...UK_VENUES, ...AMERICAS_VENUES, ...WORLD_VENUES].sort((a, b) => (a.id < b.id ? -1 : 1))
export const REAL_VENUE_BY_ID: Record<string, RealVenueDefinition> = Object.fromEntries(REAL_VENUES.map((v) => [v.id, v]))
