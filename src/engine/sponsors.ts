/**
 * STANDING SPONSORS (Phase 4.6c): logic. Data lives in `sponsorCatalog.ts`.
 *
 * Money rule: every pound a sponsor pays goes through `ledger.post` (category `standingSponsor`) with a description naming the
 * sponsor and the reason — quarterly instalments, per-event support, sell-out bonuses. Nothing is paid outside the ledger and
 * nothing is paid twice (instalments are keyed to `nextPayDay`, event payments to the settled event).
 *
 * Determinism: offers use keyed randomness (`keyedFloat(seed, …)`), never the world RNG, so adding sponsors does not disturb any
 * other part of the simulation's random sequence.
 */
import { weeksBetween } from './calendar'
import { post } from './ledger'
import { postMessage } from './messages'
import { keyedFloat } from './rng'
import { player } from './selectors'
import { LENGTH_MULT, SPONSOR_CATALOG, SPONSOR_LENGTHS, sponsorDef, type SponsorDef } from './sponsorCatalog'
import { TIER_DEFS } from './tiers'
import type { BoxingEvent, GameState, Id, VenueTier } from './types'

const VENUE_RANK: VenueTier[] = ['local', 'regional', 'national', 'arena', 'stadium']
const YEAR = 364
const QUARTER = 91
const OFFER_DAYS = 56
const DECLINE_COOLDOWN = 182
const MAX_OPEN_OFFERS = 2
const OFFER_CHANCE = 0.35
const SELLOUT_FILL = 0.85
const START_RELATIONSHIP = 50
const KEEP_ENDED = 8

export interface SponsorDeal {
  id: Id
  sponsorId: string
  startDay: number
  endDay: number
  years: 1 | 2 | 3
  annual: number
  perEvent: number
  minEvents: number
  minVenue: VenueTier
  minAudience: number
  /** 0–100. */
  relationship: number
  /** Qualifying shows in the current contract year. */
  eventsThisYear: number
  yearStart: number
  nextPayDay: number
  /** Contract years in a row that missed the event minimum. */
  strikes: number
  status: 'active' | 'ended' | 'terminated'
  earned: number
  endedDay?: number
  endReason?: string
  warned: boolean
}

export interface SponsorOffer {
  id: Id
  sponsorId: string
  day: number
  expiresDay: number
  annual: number
  perEvent: number
  kind: 'new' | 'renewal'
  negotiated: boolean
}

export interface SponsorBook {
  deals: SponsorDeal[]
  offers: SponsorOffer[]
  /** sponsorId → day the player turned them down (cool-down). */
  declined: Record<string, number>
  /** Lifetime standing-sponsor income (for display; the ledger is the source of truth). */
  earned: number
}

export const freshSponsorBook = (): SponsorBook => ({ deals: [], offers: [], declined: {}, earned: 0 })
const book = (state: GameState): SponsorBook => (state.sponsors ??= freshSponsorBook())
const rank = (t: VenueTier) => VENUE_RANK.indexOf(t)

export const activeDeals = (state: GameState): SponsorDeal[] => (state.sponsors?.deals ?? []).filter((d) => d.status === 'active')

/** Why a sponsor will not (yet) talk to this promotion; null when they would. */
export function eligibility(state: GameState, def: SponsorDef): string | null {
  const p = player(state)
  const t = TIER_DEFS[p.tier]
  if (TIER_DEFS[def.minPromotionTier].rank > t.rank) return `Needs a ${TIER_DEFS[def.minPromotionTier].label} promotion`
  if (p.reputation < def.minReputation) return `Needs promotion reputation ${def.minReputation}+`
  if (p.fanbase < def.minFanbase) return `Needs a fanbase of ${def.minFanbase.toLocaleString('en-GB')}+`
  return null
}

function valueFactor(state: GameState, def: SponsorDef): number {
  return 0.9 + Math.min(0.3, Math.max(0, player(state).reputation - def.minReputation) / 100)
}

export function industryHeld(state: GameState, industry: string): boolean {
  return activeDeals(state).some((d) => sponsorDef(d.sponsorId)?.industry === industry)
}

/** Weekly: expire offers, bring new interest, pay instalments, review contract years, end or renew contracts. */
export function processSponsors(state: GameState): void {
  const b = book(state)
  const p = player(state)
  const week = Math.floor((state.today - state.startDay) / 7)

  b.offers = b.offers.filter((o) => o.expiresDay >= state.today)

  // Instalments (quarterly) — each is its own ledger line.
  for (const d of activeDeals(state)) {
    while (d.status === 'active' && state.today >= d.nextPayDay && d.nextPayDay < d.endDay + 1) {
      const amount = Math.round(d.annual / 4)
      post(state, 'standingSponsor', amount, `Standing sponsor — ${sponsorDef(d.sponsorId)?.name ?? d.sponsorId} (quarterly instalment)`)
      d.earned += amount; b.earned += amount
      d.nextPayDay += QUARTER
    }
    // Contract-year review.
    if (state.today >= d.yearStart + YEAR) reviewYear(state, d)
  }

  // New interest, once every four weeks.
  if (week % 4 === 0) generateOffers(state)
  void p
}

function reviewYear(state: GameState, d: SponsorDeal): void {
  const b = book(state)
  const def = sponsorDef(d.sponsorId)
  const name = def?.name ?? d.sponsorId
  const ok = d.eventsThisYear >= d.minEvents
  d.relationship = Math.max(0, Math.min(100, d.relationship + (ok ? 10 : -20)))
  d.strikes = ok ? 0 : d.strikes + 1
  d.yearStart += YEAR
  d.eventsThisYear = 0
  d.warned = false
  if (!ok) {
    postMessage(state, { from: 'Commercial', category: 'finance', priority: 'important', key: `sponsor-miss-${d.id}-${d.yearStart}`, cooldownWeeks: 40,
      subject: `${name} is unhappy`, body: `You promoted fewer than the ${d.minEvents} qualifying shows the contract asks for this year. Their relationship with you has cooled${d.strikes >= 2 ? ' — and this is the second year in a row' : ''}.`, link: { kind: 'screen', screen: 'sponsors' } })
  }
  if (d.strikes >= 2) {
    d.status = 'terminated'; d.endedDay = state.today; d.endReason = 'Missed event minimum two years running'
    postMessage(state, { from: 'Commercial', category: 'finance', priority: 'important', key: `sponsor-end-${d.id}`, subject: `${name} has ended the partnership`, body: 'Two years without the shows they were promised was too much. The remaining instalments will not be paid.', link: { kind: 'screen', screen: 'sponsors' } })
    return
  }
  if (state.today >= d.endDay) {
    d.status = 'ended'; d.endedDay = state.today; d.endReason = 'Contract completed'
    if (def && d.relationship >= 55 && ok) {
      const grown = Math.round((def.annual * valueFactor(state, def) * (1 + (d.relationship - 50) / 200)) / 1000) * 1000
      const annual = Math.max(d.annual / LENGTH_MULT[d.years], grown)
      const perEvent = Math.round((def.perEvent * valueFactor(state, def) * (1 + (d.relationship - 50) / 200)) / 100) * 100
      if (!b.offers.some((o) => o.sponsorId === def.id)) b.offers.push({ id: `renew_${def.id}_${state.today}`, sponsorId: def.id, day: state.today, expiresDay: state.today + OFFER_DAYS, annual, perEvent: Math.max(perEvent, d.perEvent), kind: 'renewal', negotiated: false })
      postMessage(state, { from: 'Commercial', category: 'finance', priority: 'important', subject: `${name} would like to renew`, body: `They were happy with the partnership and have put a renewal on the table. It is waiting on the Sponsors screen.`, link: { kind: 'screen', screen: 'sponsors' } })
    } else {
      postMessage(state, { from: 'Commercial', category: 'finance', priority: 'normal', subject: `${name} contract has ended`, body: 'The partnership has run its course and they have not offered to renew.', link: { kind: 'screen', screen: 'sponsors' } })
    }
  }
  // Keep the book small.
  const ended = b.deals.filter((x) => x.status !== 'active')
  if (ended.length > KEEP_ENDED) { const drop = new Set(ended.slice(0, ended.length - KEEP_ENDED).map((x) => x.id)); b.deals = b.deals.filter((x) => !drop.has(x.id)) }
}

function generateOffers(state: GameState): void {
  const b = book(state)
  const p = player(state)
  const t = TIER_DEFS[p.tier]
  if (b.offers.length >= MAX_OPEN_OFFERS) return
  if (activeDeals(state).length + b.offers.length >= t.sponsorSlots) return
  const week = Math.floor((state.today - state.startDay) / 7)
  const candidates = SPONSOR_CATALOG
    .filter((def) => def.tier <= t.sponsorTier && !eligibility(state, def) && !industryHeld(state, def.industry)
      && !activeDeals(state).some((d) => d.sponsorId === def.id) && !b.offers.some((o) => o.sponsorId === def.id || sponsorDef(o.sponsorId)?.industry === def.industry)
      && !(b.declined[def.id] !== undefined && state.today - b.declined[def.id] < DECLINE_COOLDOWN))
    .map((def) => ({ def, u: keyedFloat(state.seed, 'sponsor-offer', week, def.id) }))
    .filter((c) => c.u < OFFER_CHANCE)
    .sort((a, c) => c.def.tier - a.def.tier || a.u - c.u)
  const pick = candidates[0]
  if (!pick) return
  const f = valueFactor(state, pick.def)
  b.offers.push({ id: `offer_${pick.def.id}_${state.today}`, sponsorId: pick.def.id, day: state.today, expiresDay: state.today + OFFER_DAYS, annual: Math.round((pick.def.annual * f) / 1000) * 1000, perEvent: Math.round((pick.def.perEvent * f) / 100) * 100, kind: 'new', negotiated: false })
  postMessage(state, { from: 'Commercial', category: 'finance', priority: 'important', key: `sponsor-offer-${pick.def.id}`, cooldownWeeks: 20,
    subject: `${pick.def.name} is interested`, body: `${pick.def.name} — ${pick.def.pitch} — would like to become an official partner of ${p.name}. Their offer is waiting on the Sponsors screen for the next eight weeks.`, link: { kind: 'screen', screen: 'sponsors' } })
}

/** Called when a PLAYER show is settled: qualifying shows pay the per-event fee (+ sell-out bonus) and keep sponsors happy. */
export function sponsorsOnEvent(state: GameState, ev: BoxingEvent): void {
  if (ev.promotionId !== state.playerPromotionId || !ev.result || !state.sponsors) return
  const v = state.venues[ev.venueId]
  const att = ev.result.attendance
  for (const d of activeDeals(state)) {
    if (rank(v.tier) < rank(d.minVenue) || att < d.minAudience) continue
    const name = sponsorDef(d.sponsorId)?.name ?? d.sponsorId
    d.eventsThisYear++
    d.relationship = Math.min(100, d.relationship + 2)
    post(state, 'standingSponsor', d.perEvent, `Sponsor payment — ${name} (${ev.name})`)
    d.earned += d.perEvent; state.sponsors.earned += d.perEvent
    const def = sponsorDef(d.sponsorId)
    if (def && att >= SELLOUT_FILL * v.capacity) {
      const bonus = Math.round((d.perEvent * def.bonusShare) / 50) * 50
      if (bonus > 0) { post(state, 'standingSponsor', bonus, `Sponsor bonus — ${name} (sell-out, ${ev.name})`); d.earned += bonus; state.sponsors.earned += bonus }
    }
  }
}

// ------------------------------------------------------------------ Commands

export interface SponsorResult { ok: boolean; error?: string; state: GameState }
const fail = (state: GameState, error: string): SponsorResult => ({ ok: false, error, state })

export function acceptSponsorOffer(input: GameState, offerId: Id, years: 1 | 2 | 3): SponsorResult {
  const offer = input.sponsors?.offers.find((o) => o.id === offerId)
  if (!offer) return fail(input, 'That offer is no longer available.')
  const def = sponsorDef(offer.sponsorId)
  if (!def) return fail(input, 'Unknown sponsor.')
  if (!SPONSOR_LENGTHS.includes(years)) return fail(input, 'Choose a contract of one, two or three years.')
  const t = TIER_DEFS[player(input).tier]
  if (activeDeals(input).length >= t.sponsorSlots) return fail(input, `A ${t.label} promotion can hold ${t.sponsorSlots} standing sponsor${t.sponsorSlots === 1 ? '' : 's'}.`)
  if (industryHeld(input, def.industry)) return fail(input, `You already have an official ${def.industry} partner.`)
  const why = eligibility(input, def)
  if (why) return fail(input, why)
  const state = structuredClone(input)
  const b = book(state)
  b.offers = b.offers.filter((o) => o.id !== offerId)
  b.deals.push({
    id: `deal_${def.id}_${state.today}`, sponsorId: def.id, startDay: state.today, endDay: state.today + years * YEAR, years,
    annual: Math.round((offer.annual * LENGTH_MULT[years]) / 1000) * 1000, perEvent: offer.perEvent, minEvents: def.minEvents, minVenue: def.minVenue, minAudience: def.minAudience,
    relationship: START_RELATIONSHIP, eventsThisYear: 0, yearStart: state.today, nextPayDay: state.today + QUARTER, strikes: 0, status: 'active', earned: 0, warned: false,
  })
  return { ok: true, state }
}

/** One counter per offer: better terms if the sponsor rates you above their bar, otherwise they may walk. Deterministic. */
export function negotiateSponsorOffer(input: GameState, offerId: Id): SponsorResult {
  const offer = input.sponsors?.offers.find((o) => o.id === offerId)
  if (!offer) return fail(input, 'That offer is no longer available.')
  if (offer.negotiated) return fail(input, 'They have already given their best terms.')
  const def = sponsorDef(offer.sponsorId)!
  const state = structuredClone(input)
  const b = book(state)
  const o = b.offers.find((x) => x.id === offerId)!
  o.negotiated = true
  const chance = Math.max(0.1, Math.min(0.85, 0.35 + (player(state).reputation - def.minReputation) / 60))
  const u = keyedFloat(state.seed, 'sponsor-neg', offerId)
  if (u < chance) {
    o.annual = Math.round((o.annual * 1.12) / 1000) * 1000
    o.perEvent = Math.round((o.perEvent * 1.1) / 100) * 100
    postMessage(state, { from: 'Commercial', category: 'finance', priority: 'normal', subject: `${def.name} improved their offer`, body: 'They agreed to better terms. The revised offer is on the Sponsors screen.', link: { kind: 'screen', screen: 'sponsors' } })
  } else if (u > 0.6 + (chance - 0.35) * 0.5) {
    b.offers = b.offers.filter((x) => x.id !== offerId)
    b.declined[def.id] = state.today
    postMessage(state, { from: 'Commercial', category: 'finance', priority: 'normal', subject: `${def.name} withdrew`, body: 'Pushing for more did not go down well; they have taken their offer off the table for now.', link: { kind: 'screen', screen: 'sponsors' } })
  } else {
    postMessage(state, { from: 'Commercial', category: 'finance', priority: 'normal', subject: `${def.name} held firm`, body: 'They will not move on price, but the original offer stands.', link: { kind: 'screen', screen: 'sponsors' } })
  }
  return { ok: true, state }
}

export function declineSponsorOffer(input: GameState, offerId: Id): SponsorResult {
  const offer = input.sponsors?.offers.find((o) => o.id === offerId)
  if (!offer) return fail(input, 'That offer is no longer available.')
  const state = structuredClone(input)
  const b = book(state)
  b.offers = b.offers.filter((o) => o.id !== offerId)
  b.declined[offer.sponsorId] = state.today
  return { ok: true, state }
}

// -------------------------------------------------------------------- Views

export interface DealView {
  id: Id; name: string; industry: string; years: number; annual: number; perEvent: number; relationship: number; relationshipLabel: string
  eventsThisYear: number; minEvents: number; weeksLeft: number; weeksLeftInYear: number; minVenue: VenueTier; minAudience: number; earned: number; marketingBonus: number
  status: SponsorDeal['status']; endReason?: string; nextPayment: { day: number; amount: number } | null
  /** Qualifying shows still needed this contract year. */
  needed: number
}
export interface OfferView { id: Id; sponsorId: string; name: string; industry: string; kind: 'new' | 'renewal'; annual: number; perEvent: number; minEvents: number; minVenue: VenueTier; minAudience: number; weeksLeft: number; negotiated: boolean; pitch: string; marketingBonus: number; lengths: { years: 1 | 2 | 3; annual: number; total: number }[]; blocked: string | null }
export interface CatalogView { id: string; name: string; industry: string; tier: number; annual: number; perEvent: number; status: 'active' | 'offered' | 'available' | 'locked'; reason: string | null }

export const relationshipLabel = (r: number): string => (r >= 80 ? 'Devoted' : r >= 65 ? 'Strong' : r >= 45 ? 'Steady' : r >= 25 ? 'Cooling' : 'Strained')

export function sponsorView(state: GameState): { deals: DealView[]; past: DealView[]; offers: OfferView[]; catalog: CatalogView[]; slots: { used: number; max: number }; earned: number; annualRun: number } {
  const b = state.sponsors ?? freshSponsorBook()
  const t = TIER_DEFS[player(state).tier]
  const toView = (d: SponsorDeal): DealView => {
    const def = sponsorDef(d.sponsorId)
    const left = d.endDay - state.today
    return {
      id: d.id, name: def?.name ?? d.sponsorId, industry: def?.industry ?? '', years: d.years, annual: d.annual, perEvent: d.perEvent, relationship: Math.round(d.relationship), relationshipLabel: relationshipLabel(d.relationship),
      eventsThisYear: d.eventsThisYear, minEvents: d.minEvents, weeksLeft: Math.max(0, Math.ceil(left / 7)), weeksLeftInYear: Math.max(0, Math.ceil((d.yearStart + YEAR - state.today) / 7)),
      minVenue: d.minVenue, minAudience: d.minAudience, earned: d.earned, marketingBonus: def?.marketingBonus ?? 0, status: d.status, endReason: d.endReason,
      nextPayment: d.status === 'active' ? { day: d.nextPayDay, amount: Math.round(d.annual / 4) } : null, needed: Math.max(0, d.minEvents - d.eventsThisYear),
    }
  }
  const active = b.deals.filter((d) => d.status === 'active')
  const offers = b.offers.map((o): OfferView => {
    const def = sponsorDef(o.sponsorId)!
    const blocked = active.length >= t.sponsorSlots ? `Your ${t.label} promotion can hold ${t.sponsorSlots} standing sponsor${t.sponsorSlots === 1 ? '' : 's'}.` : industryHeld(state, def.industry) ? `You already have an official ${def.industry} partner.` : null
    return { id: o.id, sponsorId: def.id, name: def.name, industry: def.industry, kind: o.kind, annual: o.annual, perEvent: o.perEvent, minEvents: def.minEvents, minVenue: def.minVenue, minAudience: def.minAudience,
      weeksLeft: Math.max(0, weeksBetween(state.today, o.expiresDay)), negotiated: o.negotiated, pitch: def.pitch, marketingBonus: def.marketingBonus ?? 0, blocked,
      lengths: SPONSOR_LENGTHS.map((y) => { const a = Math.round((o.annual * LENGTH_MULT[y]) / 1000) * 1000; return { years: y, annual: a, total: a * y } }) }
  })
  const catalog = SPONSOR_CATALOG.map((def): CatalogView => {
    const held = active.some((d) => d.sponsorId === def.id)
    const offered = b.offers.some((o) => o.sponsorId === def.id)
    const why = eligibility(state, def)
    return { id: def.id, name: def.name, industry: def.industry, tier: def.tier, annual: def.annual, perEvent: def.perEvent, status: held ? 'active' : offered ? 'offered' : why ? 'locked' : 'available', reason: why }
  })
  return { deals: active.map(toView), past: b.deals.filter((d) => d.status !== 'active').map(toView).reverse(), offers, catalog, slots: { used: active.length, max: t.sponsorSlots }, earned: b.earned, annualRun: active.reduce((n, d) => n + d.annual, 0) }
}
