/**
 * REAL-WORLD VENUES in the game. A real venue becomes a game `Venue` through `venueFromReal`: `capacity` is its BOXING capacity,
 * the hire cost comes from the game's own per-seat curve (venue hire in the game is an abstraction, not a published price), and the
 * audience pools are blended into the single `market` the demand model reads. Researched facts live in `src/data/realVenues`;
 * everything else here is a modelling rule.
 *
 * The many unnamed halls boxing is really staged in are represented by a few GENERIC halls, clearly flagged `generic` — they are
 * game placeholders, not buildings.
 */
import { VENUE_SEEDS, venueFields, tierFor } from '../../data/venues'
import { REAL_VENUES, REAL_VENUE_BY_ID, type RealVenueDefinition } from '../../data/realVenues'
import { distanceKm, hometownCoord, NATION_CENTRES } from '../../data/geo'
import type { Fight, GameState, Id, Venue } from '../types'

/** The game's hire-cost curve: (boxing capacity, nightly hire) anchors from the fictional ladder it was balanced on. */
const CURVE: [number, number][] = [[450, 1_200], [900, 2_400], [1_400, 4_500], [2_200, 10_200], [3_500, 18_000], [4_800, 33_000], [6_000, 51_000], [9_000, 104_000], [12_500, 156_000], [15_000, 200_000], [18_000, 300_000], [20_000, 420_000], [48_000, 860_000], [55_000, 960_000]]

const EXPECTED_PRESTIGE = (cap: number): number => (cap < 1_500 ? 1 : cap < 5_000 ? 2.5 : cap < 14_000 ? 3.5 : cap < 30_000 ? 4.5 : 5)

export function hireCostFor(capacity: number, prestige: number): number {
  const c = Math.max(CURVE[0][0] * 0.5, capacity)
  let base: number
  if (c <= CURVE[0][0]) base = CURVE[0][1] * (c / CURVE[0][0])
  else if (c >= CURVE[CURVE.length - 1][0]) { const [c1, h1] = CURVE[CURVE.length - 1]; base = h1 * Math.pow(c / c1, 1.02) }
  else {
    let i = 1
    while (CURVE[i][0] < c) i++
    const [c0, h0] = CURVE[i - 1], [c1, h1] = CURVE[i]
    const t = (Math.log(c) - Math.log(c0)) / (Math.log(c1) - Math.log(c0))
    base = Math.exp(Math.log(h0) + t * (Math.log(h1) - Math.log(h0)))
  }
  // A famous building costs more than its seats alone, an unfashionable one less (bounded ±22%).
  const adj = Math.max(0.82, Math.min(1.22, 1 + 0.07 * (prestige - EXPECTED_PRESTIGE(capacity))))
  const r = base * adj
  const step = r < 10_000 ? 100 : r < 100_000 ? 500 : 1_000
  return Math.round(r / step) * step
}

export function venueFromReal(d: RealVenueDefinition): Venue {
  const capacity = d.boxingCapacity
  const market = Math.round((0.55 * d.market.local + 0.3 * d.market.national + 0.15 * d.market.international) * 100) / 100
  const base = venueFields({ name: d.name, city: d.city, country: d.country, capacity, hireCost: 0, prestige: d.prestige, production: d.production, market })
  return {
    id: d.id, name: d.name, city: d.city, country: d.country, capacity, hireCost: hireCostFor(capacity, d.prestige), prestige: d.prestige, ...base,
    realId: d.id, region: d.region, lat: d.latitude, lon: d.longitude, pools: d.market, broadcast: d.broadcastSuitability, ppv: d.ppvSuitability, history: d.boxingHistory,
  }
}

/** Placeholder halls for the many unnamed rooms boxing is staged in. */
export const GENERIC_SEEDS = VENUE_SEEDS.filter((v) => v.capacity <= 3_000)

/** Every venue for a new world: all real venues plus the generic halls (generic ids come from the world's id generator). */
export function buildWorldVenues(nextId: (prefix: string) => string): Record<Id, Venue> {
  const out: Record<Id, Venue> = {}
  // The id counter advances exactly as it did when every venue was fictional, so nothing generated after the venues (promotions,
  // fighters, contracts) changes id: existing saves, tests and the asset manifest stay in step.
  for (const v of VENUE_SEEDS) {
    const id = nextId('v')
    if (v.capacity <= 3_000) out[id] = { id, name: v.name, city: v.city, country: v.country, capacity: v.capacity, hireCost: v.hireCost, prestige: v.prestige, ...venueFields(v), generic: true }
  }
  for (const d of REAL_VENUES) out[d.id] = venueFromReal(d)
  return out
}

/**
 * Save migration (v8 → v9): the real venues are added; venues that were part of the old fictional ladder are kept (events and fights
 * point at them) — small ones become generic halls, large ones are marked legacy and no longer offered for new bookings.
 * No venue is ever duplicated: a fictional venue is never converted into, or matched against, a real building by name.
 */
export function migrateVenues(s: any): void {
  const genericNames = new Set(GENERIC_SEEDS.map((g) => g.name))
  for (const v of Object.values<any>(s.venues)) {
    if (v.realId) continue
    if (genericNames.has(v.name)) v.generic = true
    else v.legacy = true
  }
  for (const d of REAL_VENUES) if (!s.venues[d.id]) s.venues[d.id] = venueFromReal(d)
}

/** Venues that may be offered for a new booking. */
export const bookable = (v: Venue): boolean => !v.legacy

// ------------------------------------------------------------------- Geography

export function venueCoord(v: Venue): [number, number] | null {
  if (v.lat !== undefined && v.lon !== undefined) return [v.lat, v.lon]
  return NATION_CENTRES[v.country] ?? null
}

export function fighterDistanceKm(state: GameState, fighterId: Id, v: Venue): number | null {
  const f = state.fighters[fighterId]
  const vc = venueCoord(v)
  const hc = f ? hometownCoord(f.nationality, f.hometown) : null
  return vc && hc ? distanceKm(hc, vc) : null
}

/** What getting one fighter’s camp (fighter + trainer) to the venue costs. Free inside an hour and a half’s drive. */
export function campTravelCost(km: number): number {
  if (km < 120) return 0
  if (km < 800) return Math.round((35 + 0.18 * km) * 2 + (km >= 300 ? 180 : 0))
  return Math.round(((220 + 0.11 * km) * 2 + 270) / 10) * 10
}

/** Total travel for a card’s fighters (rounded to £10). */
export function travelCost(state: GameState, fighterIds: Id[], v: Venue): number {
  let n = 0
  for (const id of fighterIds) { const km = fighterDistanceKm(state, id, v); if (km !== null) n += campTravelCost(km) }
  return Math.round(n / 10) * 10
}

export function cardFighterIds(fights: Fight[]): Id[] {
  const out: Id[] = []
  for (const f of fights) out.push(f.sideA.fighterId, f.sideB.fighterId)
  return out
}

/** A hometown crowd: headline fighters who live near the venue sell tickets there (up to +12% general-admission demand). */
export function homePull(state: GameState, fights: Fight[], v: Venue): number {
  if (!fights.length) return 0
  const top = fights.slice(-2)
  let pull = 0
  for (const f of top) for (const id of [f.sideA.fighterId, f.sideB.fighterId]) {
    const fighter = state.fighters[id]
    const km = fighterDistanceKm(state, id, v)
    if (!fighter || km === null || km > 90) continue
    pull += 0.03 + 0.05 * Math.min(1, fighter.popularity / 80)
  }
  return Math.min(0.12, pull)
}

export function realDefinition(v: Venue): RealVenueDefinition | null { return v.realId ? REAL_VENUE_BY_ID[v.realId] ?? null : null }
export { tierFor }
