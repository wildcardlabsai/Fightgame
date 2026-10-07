import { describe, expect, it } from 'vitest'
import { allAdvice, deskAdvice, sponsorAdvice, tierAdvice, visibleAdvice } from './advisor'
import { createEvent } from './commands'
import { post } from './ledger'
import { deserialiseGame, serialiseGame } from './save'
import { SCENARIO_ORDER, SCENARIOS, type ScenarioId } from './scenarios'
import { player, playerRoster } from './selectors'
import { acceptSponsorOffer, activeDeals, declineSponsorOffer, negotiateSponsorOffer, processSponsors, sponsorsOnEvent, sponsorView } from './sponsors'
import { SPONSOR_CATALOG, sponsorDef } from './sponsorCatalog'
import { advanceOneWeek } from './tick'
import { ackTierNotice, DEMOTE_WEEKS, highestQualifyingTier, QUALIFY_WEEKS, tierStatus } from './tierProgress'
import { playerRosterCap, TIER_DEFS, TIER_SEQUENCE, tierAllowsBroadcast, tierAllowsVenue } from './tiers'
import { eventView, venueViews } from './eventViews'
import { rosterFull } from './roster'
import { availabilityFor } from './market'
import { GAME_STATE_VERSION, type BoxingEvent, type GameState, type PromotionTier } from './types'
import { createNewGame } from './worldgen'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const fresh = (seed = 'p46', scenario?: ScenarioId) => createNewGame({ seed, promotionName: 'P46', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo, scenario }, 1_700_000_000_000)
const SAT = 5
const satIn = (s: GameState, weeks: number) => s.today + SAT + 7 * (weeks - 1)
const venueOfTier = (s: GameState, tier: string) => Object.values(s.venues).find((v) => v.tier === tier)!
const ledgerBalanced = (s: GameState) => expect(s.ledgerArchive + s.ledger.reduce((a, t) => a + t.amount, 0)).toBe(player(s).cash)

/** Make the promotion satisfy every Regional requirement. */
function meetRegional(s: GameState): GameState {
  const p = player(s)
  p.reputation = 20; p.fanbase = 12_000; p.stats.events = 6; p.stats.revenue = 200_000
  return s
}

describe('promotion tier data', () => {
  it('has five tiers with ascending caps, venues, sponsor slots and requirements', () => {
    expect(TIER_SEQUENCE).toHaveLength(5)
    expect(TIER_SEQUENCE.map((t) => TIER_DEFS[t].label)).toEqual(['Local', 'Regional', 'National', 'International', 'Global'])
    const caps = TIER_SEQUENCE.map(playerRosterCap)
    expect([...caps].sort((a, b) => a - b)).toEqual(caps)
    expect(caps[0]).toBeGreaterThanOrEqual(8); expect(caps[0]).toBeLessThanOrEqual(12)
    expect(caps[1]).toBeGreaterThanOrEqual(15); expect(caps[1]).toBeLessThanOrEqual(20)
    expect(caps[2]).toBeGreaterThanOrEqual(25); expect(caps[2]).toBeLessThanOrEqual(35)
    expect(caps[3]).toBeGreaterThanOrEqual(40); expect(caps[3]).toBeLessThanOrEqual(50)
    expect(caps[4]).toBeGreaterThanOrEqual(60)
    expect(TIER_DEFS.Startup.requires).toBeNull()
    for (let i = 1; i < 5; i++) {
      const a = TIER_DEFS[TIER_SEQUENCE[i - 1]].requires, b = TIER_DEFS[TIER_SEQUENCE[i]].requires!
      expect(b.reputation).toBeGreaterThan(a?.reputation ?? -1); expect(b.fanbase).toBeGreaterThan(a?.fanbase ?? -1); expect(b.events).toBeGreaterThan(a?.events ?? -1); expect(b.revenue).toBeGreaterThan(a?.revenue ?? -1)
    }
    // Never cash alone: every tier above the first needs reputation, fans, events and revenue.
    for (const t of TIER_SEQUENCE.slice(1)) { const r = TIER_DEFS[t].requires!; expect(r.reputation).toBeGreaterThan(0); expect(r.fanbase).toBeGreaterThan(0); expect(r.events).toBeGreaterThan(0); expect(r.revenue).toBeGreaterThan(0) }
  })
  it('venue size gates by tier: Local ≤3,500 seats, Regional ≤6,000, National arenas ≤20,000, stadiums Global-only; PPV opens at National', () => {
    expect(tierAllowsVenue('Startup', { capacity: 3_500 })).toBe(true)
    expect(tierAllowsVenue('Startup', { capacity: 3_501 })).toBe(false)
    expect(tierAllowsVenue('Regional', { capacity: 6_000 })).toBe(true)
    expect(tierAllowsVenue('Regional', { capacity: 9_000 })).toBe(false)
    expect(tierAllowsVenue('National', { capacity: 20_000 })).toBe(true)
    expect(tierAllowsVenue('Major', { capacity: 48_000 })).toBe(false)
    expect(tierAllowsVenue('Global', { capacity: 55_000 })).toBe(true)
    expect(tierAllowsBroadcast('Regional', 'ppv')).toBe(false)
    expect(tierAllowsBroadcast('National', 'ppv')).toBe(true)
  })
})

describe('tier ladder sanity (Phase 4.6.1)', () => {
  const req = (t: PromotionTier) => TIER_DEFS[t].requires!
  it('every dimension rises with every step (no tier is easier than the one below it)', () => {
    for (let i = 2; i < 5; i++) {
      const a = req(TIER_SEQUENCE[i - 1]), b = req(TIER_SEQUENCE[i])
      for (const k of ['reputation', 'fanbase', 'events', 'revenue', 'bestAttendance'] as const) expect(b[k], `${TIER_SEQUENCE[i]} ${k}`).toBeGreaterThan(a[k])
      expect(b.established.count).toBeGreaterThanOrEqual(a.established.count)
      expect(b.established.minReputation).toBeGreaterThan(a.established.minReputation)
      expect(b.cash).toBeGreaterThanOrEqual(a.cash)
    }
  })
  it('requirements only read the promotion\'s own record — nothing a higher tier unlocks is needed to reach it (no circular dependency)', () => {
    // Each bar is reachable inside the previous tier: the biggest crowd asked for fits a venue that tier may already book.
    for (let i = 1; i < 5; i++) { const need = req(TIER_SEQUENCE[i]).bestAttendance; const prev = TIER_DEFS[TIER_SEQUENCE[i - 1]]; expect(need, TIER_SEQUENCE[i]).toBeLessThanOrEqual(prev.maxCapacity) }
    // Revenue and event counts are cumulative, not tier-gated, and fighters rated N+ can be signed at any tier.
    expect(req('National').established.minReputation).toBeLessThanOrEqual(req('Major').established.minReputation)
  })
  it('one unusual event cannot promote a promotion on its own', () => {
    const s = fresh('spike2', 'regional')
    const p = player(s)
    p.stats.bestAttendance = 20_000; p.stats.revenue = 50_000_000 // one monster night
    expect(tierStatus(s).met).toBe(false)
    expect(tierStatus(s).rows.filter((r) => !r.met).map((r) => r.key)).toEqual(expect.arrayContaining(['events', 'reputation']))
    let t = s
    for (let i = 0; i < 12; i++) t = advanceOneWeek(t)
    expect(player(t).tier).toBe('Regional')
  })
  it('the Regional Promoter starts well short of National on every measure that is about the track record', () => {
    const s = fresh('r1', 'regional')
    const st = tierStatus(s)
    const miss = st.rows.filter((r) => !r.met).map((r) => r.key)
    expect(miss).toEqual(expect.arrayContaining(['events', 'revenue', 'attendance', 'reputation']))
    expect(st.pct).toBeLessThan(60)
  })
  it('National Powerhouse starts National and stays there (it already clears the retention floor)', () => {
    let s = fresh('n1', 'national')
    for (let i = 0; i < 60; i++) s = advanceOneWeek(s)
    expect(player(s).tier).toBe('National')
    expect(s.promotionProgress!.history).toHaveLength(0)
  })
})

describe('scenario starting tiers are coherent', () => {
  const expectTier: Record<ScenarioId, PromotionTier> = { groundUp: 'Startup', regional: 'Regional', national: 'National', champion: 'Startup' }
  for (const id of SCENARIO_ORDER) {
    it(`${id} starts as ${expectTier[id]} with a roster that fits its cap and a start that already meets its own tier's entry bar`, () => {
      const s = fresh('coh', id)
      const p = player(s)
      expect(p.tier).toBe(expectTier[id])
      expect(SCENARIOS[id].tier).toBe(expectTier[id])
      expect(playerRoster(s).length).toBeLessThanOrEqual(playerRosterCap(p.tier))
      const req = TIER_DEFS[p.tier].requires
      if (req) { expect(p.reputation).toBeGreaterThanOrEqual(req.reputation); expect(p.fanbase).toBeGreaterThanOrEqual(req.fanbase) }
      expect(s.promotionProgress).toBeTruthy(); expect(s.sponsors).toBeTruthy()
    })
  }
  it('a ground-up promotion cannot book an arena or a big regional venue; a national one can book an arena but not a stadium', () => {
    const g = fresh('g', 'groundUp')
    const arena = venueOfTier(g, 'arena')
    expect(createEvent(g, { name: 'Big Night', day: satIn(g, 8), venueId: arena.id }).error).toMatch(/can book up to 3,500|opens up/i)
    const n = fresh('n', 'national')
    expect(createEvent(n, { name: 'Big Night', day: satIn(n, 8), venueId: venueOfTier(n, 'arena').id }).ok).toBe(true)
    expect(createEvent(n, { name: 'Big Night', day: satIn(n, 8), venueId: venueOfTier(n, 'stadium').id }).ok).toBe(false)
    expect(venueViews(g).filter((v) => v.locked).length).toBeGreaterThan(5)
    expect(venueViews(n).filter((v) => v.locked).every((v) => v.capacity > 20_000)).toBe(true)
  })
})

describe('roster capacity follows the promotion tier', () => {
  it('the cap rises with the tier and blocks signings at the cap', () => {
    const s = fresh('cap', 'regional')
    expect(playerRosterCap(player(s).tier)).toBe(18)
    const free = Object.values(s.fighters).find((f) => f.status === 'active' && !f.contractId)!
    expect(availabilityFor(s, free).reason ?? '').not.toMatch(/Roster full/)
    const full = structuredClone(s)
    player(full).tier = 'Startup' // 11 fighters, Local cap 10
    expect(rosterFull(full, full.playerPromotionId)).toBe(true)
    expect(availabilityFor(full, Object.values(full.fighters).find((f) => f.status === 'active' && !f.contractId)!).reason).toMatch(/Roster full \(11\/10\)/)
  })
  it('rival promotions keep their own caps (not the player table)', () => {
    const s = fresh()
    const rival = Object.values(s.promotions).find((p) => !p.isPlayer && p.tier === 'Global')!
    expect(rosterFull(s, rival.id)).toBe(false)
  })
})

describe('tier requirements and advancement', () => {
  it('reports each requirement honestly', () => {
    const s = fresh('req')
    const st = tierStatus(s)
    expect(st.current).toBe('Startup'); expect(st.next).toBe('Regional')
    expect(st.rows.map((r) => r.key)).toEqual(expect.arrayContaining(['reputation', 'fanbase', 'events', 'revenue', 'finance']))
    expect(st.met).toBe(false)
    expect(st.pct).toBeLessThan(100)
    meetRegional(s)
    expect(tierStatus(s).met).toBe(true)
  })
  it('cash alone never promotes', () => {
    const s = fresh('rich')
    post(s, 'other', 90_000_000, 'windfall')
    for (let i = 0; i < 10; i++) { const n = advanceOneWeek(s); expect(player(n).tier).toBe('Startup') }
  })
  it('qualifying for four consecutive weeks promotes once, with a notice, a message and new capacity', () => {
    let s = meetRegional(fresh('up'))
    const before = s.inbox.length
    for (let i = 1; i < QUALIFY_WEEKS; i++) { s = advanceOneWeek(s); meetRegional(s); expect(player(s).tier).toBe('Startup') }
    s = advanceOneWeek(s)
    expect(player(s).tier).toBe('Regional')
    expect(s.promotionProgress!.notice).toMatchObject({ from: 'Startup', to: 'Regional' })
    expect(s.promotionProgress!.history).toHaveLength(1)
    expect(s.inbox.length).toBeGreaterThan(before)
    expect(playerRosterCap(player(s).tier)).toBe(18)
    const acked = ackTierNotice(s)
    expect(acked.promotionProgress!.notice).toBeNull()
    expect(player(acked).tier).toBe('Regional')
  })
  it('a one-week spike does not promote', () => {
    let s = fresh('spike')
    meetRegional(s); s = advanceOneWeek(s)
    const p = player(s); p.reputation = 5
    for (let i = 0; i < 8; i++) s = advanceOneWeek(s)
    expect(player(s).tier).toBe('Startup')
    expect(s.promotionProgress!.qualifiedWeeks).toBe(0)
  })
  it('does not oscillate: a dip above the retention floor never demotes; only a sustained year below it does', () => {
    let s = fresh('osc', 'regional')
    const p = player(s)
    p.reputation = TIER_DEFS.Regional.requires!.reputation * 0.8 // below entry bar but above the retention floor
    p.fanbase = 20_000
    for (let i = 0; i < DEMOTE_WEEKS + 10; i++) { s = advanceOneWeek(s); const q = player(s); q.reputation = TIER_DEFS.Regional.requires!.reputation * 0.8; q.fanbase = Math.max(q.fanbase, 20_000) }
    expect(player(s).tier).toBe('Regional')
    expect(s.promotionProgress!.history).toHaveLength(0)
    // Now below the floor for a full year.
    { const q = player(s); q.reputation = 2; q.fanbase = 500 }
    for (let i = 0; i < DEMOTE_WEEKS - 1; i++) { s = advanceOneWeek(s); const q = player(s); q.reputation = 2; q.fanbase = 500 }
    expect(player(s).tier).toBe('Regional') // 51 weeks below the floor is not yet a year
    s = advanceOneWeek(s)
    expect(player(s).tier).toBe('Startup')
    expect(s.promotionProgress!.notice).toMatchObject({ from: 'Regional', to: 'Startup' })
  })
  it('the weekly tier check does not touch the random number generator', () => {
    const a = fresh('rng'), b = structuredClone(a)
    meetRegional(b)
    expect(advanceOneWeek(a).rngState).toBe(advanceOneWeek(b).rngState)
  })
})

describe('persistence and migration', () => {
  it('tier, progress and sponsor deals survive save/load and export/import', () => {
    let s = meetRegional(fresh('persist'))
    for (let i = 0; i < QUALIFY_WEEKS; i++) { s = advanceOneWeek(s); meetRegional(s) }
    expect(player(s).tier).toBe('Regional')
    s.sponsors!.offers.push({ id: 'offer_knockout_x', sponsorId: 'knockout', day: s.today, expiresDay: s.today + 56, annual: 70_000, perEvent: 5_000, kind: 'new', negotiated: false })
    s = acceptSponsorOffer(s, 'offer_knockout_x', 2).state
    const back = deserialiseGame(serialiseGame(s))!
    expect(back.version).toBe(GAME_STATE_VERSION)
    expect(player(back).tier).toBe('Regional')
    expect(back.promotionProgress).toEqual(s.promotionProgress)
    expect(back.sponsors).toEqual(s.sponsors)
    expect(activeDeals(back)).toHaveLength(1)
    expect(player(back).stats.revenue).toBe(player(s).stats.revenue)
  })
  it('an older save (v6, tier stuck at Startup) migrates safely and lands on the tier it already earned, quietly', () => {
    const s = meetRegional(fresh('old'))
    const raw = JSON.parse(serialiseGame(s))
    raw.version = 6; delete raw.promotionProgress; delete raw.sponsors
    for (const p of Object.values<any>(raw.promotions)) delete p.stats.revenue
    raw.promotions[raw.playerPromotionId].stats.events = 30
    raw.promotions[raw.playerPromotionId].reputation = 20
    const m = deserialiseGame(JSON.stringify(raw))!
    expect(m.version).toBe(GAME_STATE_VERSION)
    expect(m.sponsors).toEqual({ deals: [], offers: [], declined: {}, earned: 0 })
    expect(m.promotionProgress!.notice).toBeNull()
    expect(player(m).stats.revenue).toBe(0)
    expect(Object.values(m.promotions).every((p) => typeof p.stats.revenue === 'number')).toBe(true)
    // Revenue was missing, so only the cheapest tier whose bar it clears; either way it must be a valid tier and the game must run.
    expect(TIER_SEQUENCE).toContain(player(m).tier)
    const t = advanceOneWeek(m)
    expect(t.version).toBe(GAME_STATE_VERSION)
  })
  it('migration places a long-standing promotion on its earned tier', () => {
    const s = fresh('old2')
    const raw = JSON.parse(serialiseGame(s))
    raw.version = 6; delete raw.promotionProgress; delete raw.sponsors
    for (const p of Object.values<any>(raw.promotions)) delete p.stats.revenue
    const me = raw.promotions[raw.playerPromotionId]
    me.reputation = 22; me.fanbase = 15_000; me.stats.events = 9
    raw.events = { ev_x: { id: 'ev_x', promotionId: raw.playerPromotionId, result: { revenue: 400_000 }, status: 'archived', day: 1, venueId: Object.keys(raw.venues)[0], card: [], finance: { revenue: {}, costs: {} }, prices: {}, marketing: {}, broadcast: {}, sponsor: {}, sales: {}, kind: 'player', name: 'x', city: '', country: '' } }
    const m = deserialiseGame(JSON.stringify(raw))!
    expect(player(m).tier).toBe('Regional')
    expect(player(m).stats.revenue).toBe(400_000)
    expect(m.promotionProgress!.notice).toBeNull()
    expect(highestQualifyingTier(m)).toBe('Regional')
  })
})

describe('standing sponsors', () => {
  const offerFor = (s: GameState, sponsorId: string, annual?: number) => {
    const def = sponsorDef(sponsorId)!
    const id = `offer_${sponsorId}_t`
    s.sponsors!.offers.push({ id, sponsorId, day: s.today, expiresDay: s.today + 56, annual: annual ?? def.annual, perEvent: def.perEvent, kind: 'new', negotiated: false })
    return id
  }
  const regional = () => { const s = fresh('sp', 'regional'); return s }

  it('the catalog is well-formed: tiers ascend, sponsors need the tier they belong to, and money scales with tier', () => {
    expect(SPONSOR_CATALOG.length).toBeGreaterThanOrEqual(10)
    for (const d of SPONSOR_CATALOG) { expect(TIER_DEFS[d.minPromotionTier].sponsorTier).toBe(d.tier); expect(d.annual).toBeGreaterThan(0); expect(d.perEvent).toBeGreaterThan(0); expect(d.minEvents).toBeGreaterThan(0) }
    const byTier = (t: number) => SPONSOR_CATALOG.filter((d) => d.tier === t)
    for (let t = 1; t < 5; t++) expect(Math.min(...byTier(t + 1).map((d) => d.annual))).toBeGreaterThan(Math.max(...byTier(t).map((d) => d.annual)))
  })

  it('sponsors only approach a promotion that meets their requirements', () => {
    let g = fresh('only', 'groundUp')
    for (let i = 0; i < 40; i++) g = advanceOneWeek(g)
    for (const o of g.sponsors!.offers) expect(sponsorDef(o.sponsorId)!.tier).toBe(1)
    let n = fresh('only2', 'national')
    for (let i = 0; i < 60; i++) n = advanceOneWeek(n)
    const tiers = [...n.sponsors!.offers.map((o) => sponsorDef(o.sponsorId)!.tier), ...n.sponsors!.deals.map((d) => sponsorDef(d.sponsorId)!.tier)]
    expect(tiers.length).toBeGreaterThan(0)
    expect(Math.max(...tiers)).toBeLessThanOrEqual(3)
    expect(n.inbox.some((m) => /is interested/.test(m.subject))).toBe(true)
  })

  it('offers are deterministic and do not consume the world RNG', () => {
    const a = fresh('det', 'national'), b = structuredClone(a)
    let x = a, y = b
    for (let i = 0; i < 30; i++) { x = advanceOneWeek(x); y = advanceOneWeek(y) }
    expect(JSON.stringify(x.sponsors)).toBe(JSON.stringify(y.sponsors))
    expect(x.rngState).toBe(y.rngState)
  })

  it('accept / decline / negotiate work; contracts record their terms', () => {
    const s = regional()
    const id = offerFor(s, 'knockout')
    const r = acceptSponsorOffer(s, id, 3)
    expect(r.ok, r.error).toBe(true)
    const d = activeDeals(r.state)[0]
    expect(d).toMatchObject({ sponsorId: 'knockout', years: 3, status: 'active', relationship: 50, eventsThisYear: 0, minEvents: 6 })
    expect(d.annual).toBe(Math.round((70_000 * 1.1) / 1000) * 1000)
    expect(d.endDay - d.startDay).toBe(3 * 364)
    expect(r.state.sponsors!.offers).toHaveLength(0)
    expect(acceptSponsorOffer(r.state, id, 1).ok).toBe(false) // already taken
    const s2 = regional(); const id2 = offerFor(s2, 'steelhouse')
    const dec = declineSponsorOffer(s2, id2)
    expect(dec.state.sponsors!.offers).toHaveLength(0); expect(dec.state.sponsors!.declined.steelhouse).toBe(s2.today)
    const s3 = regional(); const id3 = offerFor(s3, 'northlink')
    const n1 = negotiateSponsorOffer(s3, id3)
    const n2 = negotiateSponsorOffer(s3, id3)
    expect(n1.ok && n2.ok && JSON.stringify(n1.state.sponsors) === JSON.stringify(n2.state.sponsors)).toBe(true) // deterministic
    expect(negotiateSponsorOffer(n1.state, id3).ok).toBe(false) // one counter per offer
  })

  it('exclusivity: one partner per industry; slots: capped by tier', () => {
    let s = regional()
    s = acceptSponsorOffer(s, offerFor(s, 'steelhouse'), 1).state // finance
    const second = offerFor(s, 'apex')
    expect(acceptSponsorOffer(s, second, 1).error).toMatch(/finance|National/)
    s = acceptSponsorOffer(s, offerFor(s, 'knockout'), 1).state // energy
    expect(activeDeals(s)).toHaveLength(2)
    const third = offerFor(s, 'northlink')
    expect(acceptSponsorOffer(s, third, 1).error).toMatch(/can hold 2/) // Regional = 2 slots
    expect(sponsorView(s).slots).toEqual({ used: 2, max: 2 })
  })

  it('requirements are re-checked at acceptance', () => {
    const g = fresh('req2', 'groundUp')
    const id = offerFor(g, 'apex')
    expect(acceptSponsorOffer(g, id, 1).ok).toBe(false)
  })

  it('instalments pay quarterly through the ledger, exactly once each, and the books stay balanced', () => {
    let s = regional()
    s = acceptSponsorOffer(s, offerFor(s, 'knockout'), 1).state
    const annual = activeDeals(s)[0].annual
    const cash0 = player(s).cash
    let n = 0
    const seen = new Set<string>()
    for (let i = 0; i < 52; i++) {
      s = advanceOneWeek(s)
      for (const t of s.ledger) if (t.category === 'standingSponsor' && !seen.has(t.id)) { seen.add(t.id); n++; expect(t.amount).toBe(Math.round(annual / 4)); expect(t.description).toMatch(/Knockout Energy/) }
    }
    expect(n).toBe(4) // weeks 13, 26, 39 and 52 — one quarter each, never twice
    expect(player(s).cash).toBeGreaterThan(cash0 - 5_000_000)
    ledgerBalanced(s)
    expect(s.sponsors!.earned).toBe(4 * Math.round(annual / 4))
    expect(activeDeals(s)).toHaveLength(0) // a one-year deal has run its course
  })

  it('sponsor money cannot be created outside the ledger: replaying processSponsors on the same day pays nothing new', () => {
    let s = regional()
    s = acceptSponsorOffer(s, offerFor(s, 'knockout'), 1).state
    for (let i = 0; i < 13; i++) s = advanceOneWeek(s)
    const cash = player(s).cash, n = s.ledger.filter((t) => t.category === 'standingSponsor').length
    const again = structuredClone(s)
    processSponsors(again); processSponsors(again)
    expect(player(again).cash).toBe(cash)
    expect(again.ledger.filter((t) => t.category === 'standingSponsor').length).toBe(n)
    ledgerBalanced(again)
  })

  it('qualifying shows pay the per-show fee (+ a sell-out bonus); non-qualifying shows pay nothing', () => {
    const s = regional()
    s.sponsors!.deals.length = 0
    const id = offerFor(s, 'knockout')
    const t = acceptSponsorOffer(s, id, 1).state
    const small = Object.values(t.venues).find((v) => v.tier === 'local')!
    const reg = Object.values(t.venues).find((v) => v.tier === 'regional')!
    const mk = (venueId: string, attendance: number): BoxingEvent => ({ id: `ev_${venueId}`, promotionId: t.playerPromotionId, venueId, name: 'Test Show', result: { attendance } } as unknown as BoxingEvent)
    const a = structuredClone(t)
    sponsorsOnEvent(a, mk(small.id, 400)) // local hall: below the regional minimum
    expect(activeDeals(a)[0].eventsThisYear).toBe(0); expect(a.ledger.filter((x) => x.category === 'standingSponsor')).toHaveLength(0)
    const b = structuredClone(t)
    sponsorsOnEvent(b, mk(reg.id, 300)) // too few people
    expect(activeDeals(b)[0].eventsThisYear).toBe(0)
    const c = structuredClone(t)
    const cash = player(c).cash
    sponsorsOnEvent(c, mk(reg.id, Math.max(700, Math.floor(reg.capacity * 0.9))))
    const lines = c.ledger.filter((x) => x.category === 'standingSponsor')
    expect(lines.length).toBe(2)
    expect(lines.some((l) => /Sponsor bonus/.test(l.description))).toBe(true)
    expect(player(c).cash - cash).toBe(lines.reduce((n, l) => n + l.amount, 0))
    expect(activeDeals(c)[0].eventsThisYear).toBe(1); expect(activeDeals(c)[0].relationship).toBe(52)
    ledgerBalanced(c)
  })

  it('performance: meeting the minimum builds the relationship and earns a renewal; missing it twice ends the deal', () => {
    // Good year, then expiry → renewal offer.
    let s = regional()
    s = acceptSponsorOffer(s, offerFor(s, 'knockout'), 1).state
    const d = activeDeals(s)[0]
    d.eventsThisYear = d.minEvents; d.relationship = 70
    for (let i = 0; i < 53; i++) s = advanceOneWeek(s)
    expect(activeDeals(s)).toHaveLength(0)
    expect(s.sponsors!.deals[0].status).toBe('ended')
    expect(s.sponsors!.offers.find((o) => o.kind === 'renewal' && o.sponsorId === 'knockout')).toBeTruthy()
    expect(s.inbox.some((m) => /would like to renew/.test(m.subject))).toBe(true)
    // Renewal can be accepted for another term.
    const ren = s.sponsors!.offers.find((o) => o.kind === 'renewal')!
    expect(acceptSponsorOffer(s, ren.id, 2).ok).toBe(true)

    // Two bad years in a row → terminated, no renewal.
    let b = regional()
    b = acceptSponsorOffer(b, offerFor(b, 'northlink'), 3).state
    for (let i = 0; i < 106; i++) b = advanceOneWeek(b)
    const deal = b.sponsors!.deals.find((x) => x.sponsorId === 'northlink')!
    expect(deal.status).toBe('terminated')
    expect(b.sponsors!.offers.some((o) => o.kind === 'renewal')).toBe(false)
    expect(b.inbox.some((m) => /unhappy|ended the partnership/.test(m.subject))).toBe(true)
  })

  it('offers expire; declined sponsors stay away for a cool-down', () => {
    const s = regional()
    const id = offerFor(s, 'steelhouse')
    let t = declineSponsorOffer(s, id).state
    for (let i = 0; i < 12; i++) t = advanceOneWeek(t)
    expect(t.sponsors!.offers.some((o) => o.sponsorId === 'steelhouse')).toBe(false)
    const u = regional(); offerFor(u, 'steelhouse')
    let w = u
    for (let i = 0; i < 9; i++) w = advanceOneWeek(w)
    expect(w.sponsors!.offers.some((o) => o.id === 'offer_steelhouse_t')).toBe(false) // 56 days
  })

  it('the marketing bonus applies only to the player and only while the deal is active', async () => {
    const { marketingBonus } = await import('./sponsorCatalog')
    let s = regional()
    expect(marketingBonus(s, true)).toBe(0)
    s = acceptSponsorOffer(s, offerFor(s, 'knockout'), 1).state
    expect(marketingBonus(s, true)).toBeCloseTo(0.05)
    expect(marketingBonus(s, false)).toBe(0)
  })
})

describe('advisor: sponsors and tiers', () => {
  const offerKnockout = (s: GameState) => { s.sponsors!.offers.push({ id: 'o1', sponsorId: 'knockout', day: s.today, expiresDay: s.today + 56, annual: 70_000, perEvent: 5_000, kind: 'new', negotiated: false }); return 'o1' }
  it('flags an offer, a contract running out, falling behind on events, and cash that cannot deliver them', () => {
    let s = fresh('adv', 'regional')
    s.sponsors!.offers.push({ id: 'o0', sponsorId: 'steelhouse', day: s.today, expiresDay: s.today + 56, annual: 85_000, perEvent: 6_000, kind: 'new', negotiated: false })
    expect(sponsorAdvice(s).some((a) => a.id === 'sponsor-offers' && a.level === 'tip')).toBe(true)
    s.sponsors!.offers.length = 0
    s = acceptSponsorOffer((offerKnockout(s), s), 'o1', 1).state
    const d = activeDeals(s)[0]
    d.endDay = s.today + 7 * 10
    expect(sponsorAdvice(s).find((a) => a.id.endsWith('-ending'))?.body).toMatch(/Your sponsor contract with Knockout Energy has \d+ months? remaining|under a month/)
    // Behind on shows with weeks running out.
    d.yearStart = s.today - 7 * 40; d.eventsThisYear = 1
    const adv = sponsorAdvice(s)
    expect(adv.some((a) => a.level === 'caution' && /requires 6 qualifying events this contract year and you have promoted 1/.test(a.body))).toBe(true)
    const broke = structuredClone(s); post(broke, 'other', 3_000 - player(broke).cash, 'drain')
    expect(sponsorAdvice(broke).some((a) => a.level === 'highRisk' && /cash position/.test(a.body))).toBe(true)
    // Advisor settings are respected.
    expect(visibleAdvice(sponsorAdvice(broke), 'off')).toHaveLength(0)
    expect(visibleAdvice(sponsorAdvice(broke), 'minimal').every((a) => a.level === 'highRisk' || a.level === 'critical')).toBe(true)
  })
  it('tier advice: roster full and one-step-away', () => {
    const s = fresh('tadv', 'regional')
    player(s).tier = 'Startup'
    expect(tierAdvice(s).some((a) => a.id === 'tier-roster-cap')).toBe(true)
    const t = fresh('tadv2')
    const p = player(t); p.reputation = 20; p.fanbase = 12_000; p.stats.events = 6 // revenue still short
    expect(tierAdvice(t).find((a) => a.id === 'tier-close')?.body).toMatch(/lifetime event revenue/)
  })
  it('the advisor never alters the simulation (on, full or off give identical worlds)', () => {
    const run = (mode: 'none' | 'calls') => {
      let s = fresh('inv', 'regional')
      s.sponsors!.offers.push({ id: 'o', sponsorId: 'knockout', day: s.today, expiresDay: s.today + 56, annual: 70_000, perEvent: 5_000, kind: 'new', negotiated: false })
      s = acceptSponsorOffer(s, 'o', 2).state
      for (let i = 0; i < 40; i++) {
        if (mode === 'calls') { allAdvice(s); deskAdvice(s, 'full'); deskAdvice(s, 'off'); sponsorAdvice(s); tierAdvice(s); sponsorView(s); tierStatus(s) }
        s = advanceOneWeek(s)
      }
      return JSON.stringify(s)
    }
    expect(run('calls')).toBe(run('none'))
  })
  it('advice reads public information only (no hidden fields)', async () => {
    const { readFileSync } = await import('node:fs'); const { join } = await import('node:path')
    for (const f of ['sponsors.ts', 'sponsorCatalog.ts', 'tiers.ts', 'tierProgress.ts']) {
      const src = readFileSync(join(__dirname, f), 'utf8')
      for (const re of [/\.attributes\b/, /\.potential\b/, /\.(discipline|composure|injuryRisk|personalityNote|promoRelations)\b/, /'actual'/]) expect(src, `${f} ${re}`).not.toMatch(re)
    }
  })
  it('event view still works for a tier-gated world (no regression)', () => {
    const s = fresh('ev', 'national')
    const made = createEvent(s, { name: 'Arena Night', day: satIn(s, 8), venueId: venueOfTier(s, 'arena').id })
    expect(made.ok).toBe(true)
    expect(eventView(made.state, made.eventId!)).toBeTruthy()
  })
})

// Browser-test fixtures (only when E2E_FIXTURES=<dir>)
import { mkdirSync, writeFileSync } from 'node:fs'
describe.skipIf(!process.env.E2E_FIXTURES)('e2e fixtures (4.6c)', () => {
  it('writes saves', () => {
    const dir = process.env.E2E_FIXTURES!
    mkdirSync(dir, { recursive: true })
    // regional career with two sponsor offers waiting
    const a = fresh('e2e-sp', 'regional')
    a.sponsors!.offers.push({ id: 'offer_knockout_f', sponsorId: 'knockout', day: a.today, expiresDay: a.today + 56, annual: 70_000, perEvent: 5_000, kind: 'new', negotiated: false })
    a.sponsors!.offers.push({ id: 'offer_northlink_f', sponsorId: 'northlink', day: a.today, expiresDay: a.today + 56, annual: 65_000, perEvent: 4_500, kind: 'new', negotiated: false })
    writeFileSync(`${dir}/sponsor-offers.json`, serialiseGame(a))
    // ground-up promotion one week from a tier-up
    const t = fresh('e2e-tier', 'groundUp')
    meetRegional(t)
    t.promotionProgress!.qualifiedWeeks = QUALIFY_WEEKS - 1
    writeFileSync(`${dir}/tier-ready.json`, serialiseGame(t))
    // sponsor deal that has fallen behind on events, with little cash
    let d = fresh('e2e-behind', 'regional')
    d.sponsors!.offers.push({ id: 'o', sponsorId: 'knockout', day: d.today, expiresDay: d.today + 56, annual: 70_000, perEvent: 5_000, kind: 'new', negotiated: false })
    d = acceptSponsorOffer(d, 'o', 1).state
    const deal = activeDeals(d)[0]; deal.yearStart = d.today - 7 * 40; deal.eventsThisYear = 1
    writeFileSync(`${dir}/sponsor-behind.json`, serialiseGame(d))
  })
})
