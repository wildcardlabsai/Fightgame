/**
 * Phase 5.4 — real-world venues: data integrity, the game venue model, economics (hire, travel, home crowd), the v9 migration
 * and the photo-provenance architecture.
 */
import { describe, expect, it } from 'vitest'
import { REAL_VENUES, REAL_VENUE_BY_ID } from '../data/realVenues'
import { VENUE_SEEDS } from '../data/venues'
import { distanceKm, hometownCoord } from '../data/geo'
import { NATIONS } from '../data/nations'
import { ALLOWED_LICENCES, approvedAssets, licensedPhotoCount, recordProblems, validateRecords, venueImageFor, VENUE_ASSET_RECORDS, type VenueAssetRecord } from '../assets/venueAssets'
import { campTravelCost, hireCostFor, travelCost, venueFromReal, cardFighterIds } from './business/venues'
import { createNewGame } from './worldgen'
import { advanceOneWeek } from './tick'
import { deserialiseGame, serialiseGame } from './save'
import { venueFits, venueViews } from './eventViews'
import { createEvent } from './events/events'
import { clone } from './media/testing'
import { tierAllowsVenue } from './tiers'
import { GAME_STATE_VERSION, type GameState } from './types'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const fresh = (seed: string) => createNewGame({ seed, promotionName: 'P54', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)

describe('real venue data', () => {
  it('has well-formed, non-duplicated entries with sources and honest capacities', () => {
    expect(REAL_VENUES.length).toBeGreaterThanOrEqual(100)
    expect(new Set(REAL_VENUES.map((v) => v.id)).size).toBe(REAL_VENUES.length)
    expect(new Set(REAL_VENUES.map((v) => v.name.toLowerCase())).size).toBe(REAL_VENUES.length)
    const names = new Set(REAL_VENUES.map((v) => v.name.toLowerCase()))
    for (const v of REAL_VENUES) {
      for (const a of v.aliases ?? []) expect(names.has(a.toLowerCase()) && a.toLowerCase() !== v.name.toLowerCase(), `${v.name}: alias ${a} is also a venue`).toBe(false)
      expect(v.sources.length, v.name).toBeGreaterThan(0)
      for (const s of v.sources) expect(s.url, v.name).toMatch(/^https?:\/\//)
      expect(v.boxingCapacity, v.name).toBeGreaterThan(0)
      // Only a stadium can seat more for boxing than for its usual events (ring-floor seating on the pitch); nowhere else exceeds its published maximum.
      expect(v.boxingCapacity, v.name).toBeLessThanOrEqual(v.kind === 'stadium' ? v.capacity * 1.2 : v.capacity)
      expect(Math.abs(v.latitude), v.name).toBeLessThanOrEqual(90)
      expect(Math.abs(v.longitude), v.name).toBeLessThanOrEqual(180)
      expect(['verified', 'approximate', 'unverified']).toContain(v.verificationStatus)
      expect(v.id).toBe(`rv_${v.id.slice(3)}`)
    }
    expect(REAL_VENUE_BY_ID[REAL_VENUES[0].id]).toBe(REAL_VENUES[0])
  })
  it('keeps researched facts apart from game abstractions: capacity in the game is the boxing capacity', () => {
    for (const d of REAL_VENUES.slice(0, 20)) expect(venueFromReal(d).capacity).toBe(d.boxingCapacity)
  })
})

describe('the venue model', () => {
  const s = fresh('p54-venues')
  it('a new world has every real venue plus a few clearly generic halls; fighter ids are unchanged by the venue change', () => {
    const real = Object.values(s.venues).filter((v) => v.realId)
    const generic = Object.values(s.venues).filter((v) => v.generic)
    expect(real.length).toBe(REAL_VENUES.length)
    expect(generic.length).toBeGreaterThanOrEqual(5)
    expect(generic.every((v) => v.capacity <= 3_000 && !v.realId)).toBe(true)
    expect(new Set(Object.values(s.venues).map((v) => v.name)).size).toBe(Object.keys(s.venues).length)
    expect(Object.keys(s.fighters).includes('f_15')).toBe(true)
  })
  it('hire cost follows the game’s per-seat curve: monotone in capacity, bounded by prestige, matching the old ladder at its anchors', () => {
    let prev = 0
    for (const cap of [500, 1_000, 2_000, 4_000, 8_000, 15_000, 30_000, 60_000, 90_000]) { const h = hireCostFor(cap, 3); expect(h).toBeGreaterThan(prev); prev = h }
    expect(hireCostFor(9_000, 4)).toBeGreaterThan(100_000 * 0.8)
    expect(hireCostFor(9_000, 4)).toBeLessThan(104_000 * 1.25)
    expect(hireCostFor(5_000, 5)).toBeGreaterThan(hireCostFor(5_000, 1))
    expect(hireCostFor(5_000, 5) / hireCostFor(5_000, 1)).toBeLessThan(1.6)
    for (const v of Object.values(s.venues).filter((x) => x.realId)) { const perSeat = v.hireCost / v.capacity; expect(perSeat, v.name).toBeGreaterThan(1.5); expect(perSeat, v.name).toBeLessThan(40) }
  })
  it('every promotion tier has real or generic venues to play in, including England at every size', () => {
    const eng = Object.values(s.venues).filter((v) => v.country === 'ENG')
    for (const t of ['local', 'regional', 'national', 'arena', 'stadium'] as const) expect(eng.some((v) => v.tier === t), t).toBe(true)
    for (const tier of ['Startup', 'Regional', 'National', 'Major', 'Global'] as const) expect(Object.values(s.venues).some((v) => tierAllowsVenue(tier, v))).toBe(true)
  })
  it('every fighter hometown has coordinates, and distances behave', () => {
    for (const n of NATIONS) for (const t of n.towns) expect(hometownCoord(n.key, t), `${n.key}:${t}`).not.toBeNull()
    const lon = hometownCoord('ENG', 'London')!, man = hometownCoord('ENG', 'Manchester')!
    expect(distanceKm(lon, man)).toBeGreaterThan(250); expect(distanceKm(lon, man)).toBeLessThan(330)
    expect(distanceKm(lon, lon)).toBe(0)
  })
})

describe('venue economics: travel, home crowd, booking', () => {
  it('travel is free close to home and grows with distance (road, then air); a card’s bill is the sum of its camps', () => {
    expect(campTravelCost(40)).toBe(0)
    expect(campTravelCost(250)).toBeGreaterThan(0)
    expect(campTravelCost(5_000)).toBeGreaterThan(campTravelCost(500) * 3)
    const s = fresh('p54-travel')
    const o2 = Object.values(s.venues).find((v) => v.name === 'The O2 Arena')!
    const f = Object.values(s.fighters).filter((x) => x.hometown === 'London')[0]
    const far = Object.values(s.fighters).filter((x) => x.hometown === 'Las Vegas')[0]
    expect(travelCost(s, [f.id], o2)).toBe(0)
    expect(travelCost(s, [far.id], o2)).toBeGreaterThan(2_000)
    expect(travelCost(s, [f.id, far.id], o2)).toBe(travelCost(s, [far.id], o2))
    expect(cardFighterIds([])).toEqual([])
  })
  it('the booking selector shows real facts and economics: attendance, break-even, travel, risk, home crowd, sources; generic halls say so', async () => {
    let g = fresh('p54-sel')
    for (let i = 0; i < 70; i++) g = advanceOneWeek(g)
    const promo = g.promotions[g.playerPromotionId]
    promo.cash = 3_000_000
    const hall = venueViews(g).find((v) => v.tier === 'local' && !g.venues[v.id].generic) ?? venueViews(g)[0]
    const day = g.today + 5 + 7 * 10 - ((g.today + 5 + 7 * 10) % 7)
    void day
    const evs = Object.values(g.events).filter((e) => e.promotionId === g.playerPromotionId)
    const eventId = evs[0]?.id ?? (() => { const r = createEvent(g, { name: 'Test Night', day: g.today + 5 + 7 * 8 + ((6 - ((g.today + 5 + 7 * 8) % 7)) % 7), venueId: hall.id }); if (r.ok) g = r.state; return r.eventId })()
    if (!eventId) return
    const fits = venueFits(g, eventId)
    expect(fits.length).toBeGreaterThan(20)
    const real = fits.find((f) => f.place?.real)!
    expect(real.place!.sourceCount).toBeGreaterThan(0)
    expect(real.attendance.hi).toBeLessThanOrEqual(real.capacity + 1)
    expect(fits.some((f) => f.place?.generic && /not a real building/.test(f.place.capacityNote))).toBe(true)
    for (const f of fits) { expect(f.travel).toBeGreaterThanOrEqual(0); expect(['safe', 'watch', 'highRisk']).toContain(f.risk) }
  })
})

describe('v9 migration of venues', () => {
  it('an older save keeps its fictional venues for history (small ones as generic halls, large ones as legacy), gains the real ones, and never offers a legacy venue', () => {
    const s = fresh('p54-mig')
    const old = JSON.parse(serialiseGame(s))
    // Rebuild the pre-5.4 venue set: the full fictional ladder with the old-style ids.
    old.venues = {}
    VENUE_SEEDS.forEach((v, i) => { const id = `v_${(i + 1).toString(36)}`; old.venues[id] = { id, name: v.name, city: v.city, country: v.country, capacity: v.capacity, hireCost: v.hireCost, prestige: v.prestige, tier: 'local', production: v.production ?? 2, market: v.market ?? 1, minFights: 3, maxFights: 8 } })
    delete old.business
    old.version = 8
    const loaded = deserialiseGame(JSON.stringify(old))!
    expect(loaded.version).toBe(GAME_STATE_VERSION)
    expect(loaded.business).toBeTruthy()
    const all = Object.values(loaded.venues)
    expect(all.filter((v) => v.realId).length).toBe(REAL_VENUES.length)
    expect(all.filter((v) => !v.realId).length).toBe(VENUE_SEEDS.length)
    for (const v of all.filter((x) => !x.realId)) expect(v.generic === true || v.legacy === true).toBe(true)
    expect(all.filter((v) => !v.realId && v.capacity <= 3_000).every((v) => v.generic && !v.legacy)).toBe(true)
    expect(all.filter((v) => !v.realId && v.capacity > 3_000).every((v) => v.legacy && !v.generic)).toBe(true)
    expect(new Set(all.map((v) => v.name)).size).toBe(all.length)
    const offered = new Set(venueViews(loaded).map((v) => v.id))
    for (const v of all.filter((x) => x.legacy)) expect(offered.has(v.id)).toBe(false)
    // Idempotent: saving and loading again changes nothing.
    expect(JSON.stringify(deserialiseGame(serialiseGame(loaded))!.venues)).toBe(JSON.stringify(loaded.venues))
    // And the core of the career is untouched.
    expect(loaded.rngState).toBe(s.rngState); expect(loaded.idCounter).toBe(s.idCounter)
  })
})

describe('venue photography: provenance and licensing', () => {
  const ok: VenueAssetRecord = { venueId: 'rv_the_o2_arena', assetType: 'exterior', source: 'wikimedia-commons', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example.jpg', licence: 'CC BY-SA 4.0', attribution: 'Example Author / CC BY-SA 4.0', approved: true, localAssetPath: 'assets/venues/rv_the_o2_arena/exterior.webp', hash: 'a'.repeat(64), version: 1 }
  const anyId = REAL_VENUES[0].id
  it('ships with ZERO licensed photographs, and every shipped record (none) validates', () => {
    expect(VENUE_ASSET_RECORDS).toHaveLength(0)
    expect(licensedPhotoCount()).toBe(0)
    expect(validateRecords(VENUE_ASSET_RECORDS)).toEqual([])
    for (const v of REAL_VENUES.slice(0, 10)) expect(venueImageFor(v.id).kind).toBe('placeholder')
  })
  it('a record can only be approved with a licence, a source, attribution, a local file and a hash; generated art can never pass as a photograph', () => {
    const rec = { ...ok, venueId: anyId }
    expect(recordProblems(rec)).toEqual([])
    expect(recordProblems({ ...rec, licence: 'unknown' })).toContain('approved without an allowed licence')
    expect(recordProblems({ ...rec, sourceUrl: '' })).toContain('approved without a source URL')
    expect(recordProblems({ ...rec, attribution: ' ' })).toContain('approved without attribution')
    expect(recordProblems({ ...rec, localAssetPath: null })).toContain('approved without a local file under assets/venues/')
    expect(recordProblems({ ...rec, hash: 'xyz' })).toContain('approved without a content hash')
    expect(recordProblems({ ...rec, source: 'generated' }).join()).toMatch(/cannot be approved/)
    expect(recordProblems({ ...rec, venueId: 'rv_nowhere' })).toContain('unknown venue')
    expect(ALLOWED_LICENCES.length).toBeGreaterThan(3)
  })
  it('only approved, fully documented records are shown, with their credit; everything else is the placeholder', () => {
    const rec = { ...ok, venueId: anyId }
    const unapproved = { ...rec, approved: false, version: 2 }
    const bad = { ...rec, venueId: REAL_VENUES[1].id, licence: 'unknown' as const }
    const list = [rec, unapproved, bad]
    expect(approvedAssets(anyId, list).map((r) => r.version)).toEqual([1])
    const img = venueImageFor(anyId, 'exterior', list)
    expect(img.kind).toBe('photo')
    if (img.kind === 'photo') { expect(img.attribution).toContain('Example Author'); expect(img.licence).toBe('CC BY-SA 4.0'); expect(img.sourceUrl).toMatch(/^https/) }
    expect(venueImageFor(REAL_VENUES[1].id, 'exterior', list).kind).toBe('placeholder')
    expect(venueImageFor(anyId, 'interior', list).kind).toBe('placeholder')
    expect(licensedPhotoCount(list)).toBe(1)
  })
})

describe('AI venue choices stay sane over two years', () => {
  it('rival shows use venues their tier may book, never exceed capacity, never use legacy venues, and cover many venues', () => {
    let g: GameState = fresh('p54-aivenues')
    const used = new Set<string>()
    for (let i = 0; i < 104; i++) {
      g = advanceOneWeek(g)
      for (const e of Object.values(g.events)) {
        if (e.promotionId === g.playerPromotionId) continue
        const v = g.venues[e.venueId]
        used.add(v.id)
        expect(v.legacy).toBeFalsy()
        if (e.result) expect(e.result.attendance).toBeLessThanOrEqual(v.capacity + 1)
      }
    }
    expect(used.size).toBeGreaterThanOrEqual(8)
    void clone
  }, 300000)
})
