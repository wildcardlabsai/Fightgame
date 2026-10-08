import { nation } from '../../data/nations'
import { venuePlace, venueViews, type VenueFit, type VenueView } from '../../engine/eventViews'
import type { GameState } from '../../engine/types'

export interface PlaceInfo {
  real: boolean; generic: boolean; region: string | null; countryName: string; kind: string | null
  capacityNote: string; sourceCount: number; verification: string | null
}
export interface VenueRow { v: VenueView; place: PlaceInfo; fit?: VenueFit }

export const countryOf = (code: string) => (code === 'KSA' ? 'Saudi Arabia' : nation(code)?.name ?? code)

export function placeInfo(game: GameState, v: VenueView): PlaceInfo {
  return venuePlace(game.venues[v.id])
}

export function venueRows(game: GameState, fits?: VenueFit[]): VenueRow[] {
  const by = new Map((fits ?? []).map((f) => [f.venueId, f]))
  return venueViews(game).map((v) => ({ v, place: placeInfo(game, v), fit: by.get(v.id) }))
}

// ---- filters
export interface Filters { q: string; tier: string; country: string; cap: string; type: string; avail: boolean; free: boolean; sort: string }
export const NO_FILTERS: Filters = { q: '', tier: 'all', country: 'all', cap: 'any', type: 'all', avail: false, free: false, sort: 'capacity' }
export const CAP_BUCKETS: { k: string; label: string; test: (n: number) => boolean }[] = [
  { k: 'any', label: 'Any size', test: () => true },
  { k: 's', label: 'Under 1,000', test: (n) => n < 1000 },
  { k: 'm', label: '1,000 to 4,999', test: (n) => n >= 1000 && n < 5000 },
  { k: 'l', label: '5,000 to 19,999', test: (n) => n >= 5000 && n < 20000 },
  { k: 'xl', label: '20,000 and over', test: (n) => n >= 20000 },
]
const VERDICT_RANK = { 'good fit': 0, 'too big': 1, 'too small': 2, 'loses money': 3 } as const
const mid = (r: { lo: number; hi: number }) => (r.lo + r.hi) / 2

export function filterRows(rows: VenueRow[], f: Filters): VenueRow[] {
  const q = f.q.trim().toLowerCase()
  const cap = CAP_BUCKETS.find((b) => b.k === f.cap) ?? CAP_BUCKETS[0]
  const out = rows.filter((r) =>
    (f.tier === 'all' || r.v.tier === f.tier) && (f.country === 'all' || r.place.countryName === f.country) && cap.test(r.v.capacity) &&
    (f.type === 'all' || (f.type === 'real' ? r.place.real : r.place.generic)) && (!f.avail || !r.v.locked) && (!f.free || !r.fit || r.fit.free) &&
    (!q || `${r.v.name} ${r.v.city} ${r.place.region ?? ''} ${r.place.countryName}`.toLowerCase().includes(q)))
  const s = f.sort
  return out.sort((a, b) =>
    s === 'name' ? a.v.name.localeCompare(b.v.name)
      : s === 'cost' ? a.v.hireCost - b.v.hireCost
        : s === 'capacity-desc' ? b.v.capacity - a.v.capacity
          : s === 'fit' && a.fit && b.fit ? VERDICT_RANK[a.fit.verdict] - VERDICT_RANK[b.fit.verdict] || mid(b.fit.profit) - mid(a.fit.profit)
            : s === 'attendance' && a.fit && b.fit ? mid(b.fit.attendance) - mid(a.fit.attendance)
              : a.v.capacity - b.v.capacity)
}

/** The engine's own verdict picks the cue: the free, bookable "good fit" with the best forecast profit midpoint. */
export function bestFitId(rows: VenueRow[]): string | null {
  const ok = rows.filter((r) => r.fit && r.fit.verdict === 'good fit' && r.fit.free && !r.v.locked)
  if (!ok.length) return null
  return ok.sort((a, b) => mid(b.fit!.profit) - mid(a.fit!.profit))[0].v.id
}
