/**
 * Player-facing event views. Everything here is derived from PUBLIC information (records, popularity, reputation,
 * prices, venue facts) and from results that have actually happened. Forecasts are ranges built by the same public
 * model the player could reason with; the hidden demand factor never appears here.
 */
import { tierAllowsVenue, tierDef, tierNeededForVenue } from './tiers'
import { weeksBetween } from './calendar'
import { BALANCE as B } from './balance'
import { fighterName } from './fighters'
import { STATUS_LABEL } from './fight/lifecycle'
import { resultHeadline } from './fight/narrative'
import { fightInvolvesPlayer } from './fights'
import { totalCosts, totalRevenue } from './eventFinance'
import {
  broadcastTerms, hireFor, cardFights, cardQuality, fightAppeal, forecastEvent, inventory, qualityLabel, ppvRefPrice, eventInterest,
  type Forecast,
} from './events/demand'
import { cardProblems, eventAcceptsFight, isSaturday, playerOpenEvents, venueBookedOn } from './events/events'
import { EVENT_STATUS_LABEL, isEventOpen } from './events/lifecycle'
import { viewsOf } from './view'
import { weightClassLabel } from '../data/weightClasses'
import type { BoxingEvent, BroadcastKind, EventFinance, GameState, Id, SponsorOffer, TicketPrices, Venue } from './types'

const E = B.events

export interface VenueView {
  id: Id; name: string; city: string; country: string; capacity: number; hireCost: number; tier: Venue['tier']; tierLabel: string
  prestige: number; production: number; market: number; minFights: number; maxFights: number; productionCost: number
  /** Next Saturdays this venue is free. */
  freeDates: number[]
  bookedBy: { day: number; eventName: string; mine: boolean }[]
  /** Why the player cannot book this venue yet (promotion tier), or null. */
  locked: string | null
}

export const TIER_LABEL: Record<Venue['tier'], string> = { local: 'Local hall', regional: 'Regional venue', national: 'National venue', arena: 'Arena', stadium: 'Stadium' }

export function venueView(state: GameState, v: Venue, from = state.today): VenueView {
  const bookedBy = Object.values(state.events)
    .filter((e) => e.venueId === v.id && e.status !== 'cancelled' && e.day >= from - 7)
    .sort((a, b) => a.day - b.day)
    .map((e) => ({ day: e.day, eventName: e.name, mine: e.promotionId === state.playerPromotionId }))
  const free: number[] = []
  for (let w = E.minLeadWeeks; w <= E.maxLeadWeeks && free.length < 6; w++) {
    const day = state.today + 5 + w * 7
    if (isSaturday(state, day) && !venueBookedOn(state, v.id, day)) free.push(day)
  }
  return {
    id: v.id, name: v.name, city: v.city, country: v.country, capacity: v.capacity, hireCost: hireFor(state, v, state.playerPromotionId), tier: v.tier, tierLabel: TIER_LABEL[v.tier],
    prestige: v.prestige, production: v.production, market: v.market, minFights: v.minFights, maxFights: v.maxFights,
    productionCost: Math.round(E.costs.productionByLevel[v.production - 1] + E.costs.productionPerSeat * v.capacity), freeDates: free, bookedBy,
    locked: tierAllowsVenue(state.promotions[state.playerPromotionId].tier, v.tier) ? null : `Opens at ${tierDef(tierNeededForVenue(v.tier)).label} promotion level`,
  }
}

export function venueViews(state: GameState): VenueView[] {
  return Object.values(state.venues).sort((a, b) => a.capacity - b.capacity).map((v) => venueView(state, v))
}

export interface EventListItem {
  id: Id; name: string; day: number; weeksAway: number; status: string; statusKey: string; open: boolean
  venueName: string; city: string; tierLabel: string; capacity: number; fights: number
  promotion: string; mine: boolean
  main: string
  sold: number; fillPct: number
  attendance?: number; profit?: number; reputation?: number; atmosphere?: number
  cancelReason?: string
}

export function eventListItem(state: GameState, ev: BoxingEvent): EventListItem {
  const v = state.venues[ev.venueId]
  const fights = cardFights(state, ev)
  const m = fights[fights.length - 1]
  const sold = ev.sales.sold[0] + ev.sales.sold[1] + ev.sales.sold[2]
  const r = ev.result
  return {
    id: ev.id, name: ev.name, day: ev.day, weeksAway: Math.max(0, weeksBetween(state.today, ev.day)), status: EVENT_STATUS_LABEL[ev.status], statusKey: ev.status, open: isEventOpen(ev),
    venueName: v?.name ?? '—', city: ev.city, tierLabel: v ? TIER_LABEL[v.tier] : '', capacity: v?.capacity ?? 0, fights: fights.length || ev.card.length,
    promotion: state.promotions[ev.promotionId]?.name ?? '—', mine: ev.promotionId === state.playerPromotionId,
    main: m ? `${fighterName(state.fighters[m.sideA.fighterId])} vs ${fighterName(state.fighters[m.sideB.fighterId])}` : 'No main event yet',
    sold, fillPct: v ? Math.round((100 * sold) / v.capacity) : 0,
    attendance: r?.attendance, profit: r?.profit, reputation: r?.reputation, atmosphere: r?.atmosphere, cancelReason: ev.cancelReason,
  }
}

export function eventList(state: GameState, mode: 'mine-open' | 'mine-history' | 'world-upcoming' | 'world-results', limit = 60): EventListItem[] {
  const all = Object.values(state.events)
  const sel = all.filter((e) => {
    const mine = e.promotionId === state.playerPromotionId
    if (mode === 'mine-open') return mine && isEventOpen(e)
    if (mode === 'mine-history') return mine && !isEventOpen(e)
    if (mode === 'world-upcoming') return !mine && isEventOpen(e)
    return !mine && !isEventOpen(e) && e.status !== 'cancelled'
  })
  sel.sort((a, b) => (mode === 'mine-open' || mode === 'world-upcoming' ? a.day - b.day : b.day - a.day))
  return sel.slice(0, limit).map((e) => eventListItem(state, e))
}

export interface CardSlot {
  fightId: Id; index: number
  slot: 'MAIN EVENT' | 'CO-MAIN' | 'UNDERCARD'
  aId: Id; bId: Id; aName: string; bName: string; aRecord: string; bRecord: string; division: string; rounds: number
  appeal: number; appealLabel: string
  status: string; statusKey: string
  purses: number
  result?: string
  winner?: 0 | 1 | null
  method?: string
}

export type Risk = 'safe' | 'watch' | 'highRisk'
export interface SalesView {
  sold: [number, number, number]; total: number; capacity: number; inventory: [number, number, number]; fillPct: number
  history: number[]; weeksOnSale: number; awareness: number; trend: 'accelerating' | 'steady' | 'slowing' | 'not on sale'
}

export interface EventView {
  id: Id; name: string; day: number; weeksAway: number; status: string; statusKey: string; open: boolean; mine: boolean; promotion: string
  venue: VenueView
  card: CardSlot[]
  problems: string[]
  quality: { score: number; label: string; main: number; coMain: number; depth: number; interest: number }
  prices: TicketPrices
  refPrices: TicketPrices
  marketing: BoxingEvent['marketing']
  broadcast: { kind: BroadcastKind; ppvPrice: number; options: { kind: BroadcastKind; label: string; available: boolean; reason: string | null; production: number; guaranteed: number; note: string }[] }
  sponsor: { offers: SponsorOffer[]; accepted: SponsorOffer | null }
  forecast: Forecast | null
  sales: SalesView
  finance: { revenue: EventFinance['revenue']; costs: EventFinance['costs']; totalRevenue: number; totalCosts: number; profit: number }
  result: BoxingEvent['result'] | null
  riserNames: { name: string; delta: number }[]
  cancelReason?: string
  can: { editCard: boolean; editMoney: boolean; putOnSale: boolean; cancel: boolean; run: boolean; sponsors: boolean }
  /** What the player is told to do next. */
  nextStep: string
  /** Fights the player could still add: agreed fights with eligibility. */
  addable: { fightId: Id; label: string; reason: string | null }[]
}

const BROADCAST_LABEL: Record<BroadcastKind, string> = { none: 'No broadcast', localTv: 'Local TV', nationalTv: 'National TV', streaming: 'Streaming', ppv: 'Pay-per-view' }
const BROADCAST_NOTE: Record<BroadcastKind, string> = {
  none: 'Gate and sponsors only. No production bill.',
  localTv: 'A modest fixed fee. Cheap to produce and low risk.',
  nationalTv: 'A larger fixed fee, but only for a respected promotion with a strong card.',
  streaming: 'Paid per viewer: the bigger the audience, the bigger the cheque.',
  ppv: 'Big upside from a star main event; heavy production costs and a real flop risk.',
}

function appealLabel(a: number): string {
  return a >= 70 ? 'Mega-fight' : a >= 52 ? 'Big fight' : a >= 35 ? 'Good draw' : a >= 20 ? 'Modest' : 'Low interest'
}

function slotOf(i: number, n: number): CardSlot['slot'] {
  return i === n - 1 ? 'MAIN EVENT' : i === n - 2 && n >= 3 ? 'CO-MAIN' : 'UNDERCARD'
}

export function cardSlots(state: GameState, ev: BoxingEvent): CardSlot[] {
  const fights = cardFights(state, ev)
  return fights.map((f, i) => {
    const A = state.fighters[f.sideA.fighterId], Bf = state.fighters[f.sideB.fighterId]
    const ap = fightAppeal(state, f)
    const r = f.result
    return {
      fightId: f.id, index: i, slot: slotOf(i, fights.length), aId: A.id, bId: Bf.id, aName: fighterName(A), bName: fighterName(Bf),
      aRecord: f.sideA.preRecord, bRecord: f.sideB.preRecord, division: weightClassLabel(f.weightClass), rounds: f.scheduledRounds,
      appeal: Math.round(ap), appealLabel: appealLabel(ap), status: STATUS_LABEL[f.status], statusKey: f.status,
      purses: f.terms.purseA + f.terms.purseB, result: r ? resultHeadline(f, fighterName(A), fighterName(Bf)) : undefined,
      winner: r ? r.winner : undefined, method: r ? r.method : undefined,
    }
  })
}

export function salesView(state: GameState, ev: BoxingEvent): SalesView {
  const v = state.venues[ev.venueId]
  const total = ev.sales.sold[0] + ev.sales.sold[1] + ev.sales.sold[2]
  const m = ev.sales.momentum
  const on = ev.onSaleDay !== null
  return {
    sold: ev.sales.sold, total, capacity: v.capacity, inventory: inventory(v), fillPct: Math.round((100 * total) / v.capacity), history: ev.sales.history, weeksOnSale: ev.sales.weeksOnSale,
    awareness: ev.sales.awareness, trend: !on ? 'not on sale' : m > 1.12 ? 'accelerating' : m < 0.88 ? 'slowing' : 'steady',
  }
}

export function eventView(state: GameState, id: Id): EventView | null {
  const ev = state.events[id]
  if (!ev) return null
  const mine = ev.promotionId === state.playerPromotionId
  const v = state.venues[ev.venueId]
  const q = cardQuality(state, ev)
  const interest = eventInterest(state, ev)
  const editable = mine && ['venueBooked', 'cardBuilding', 'onSale', 'promoting'].includes(ev.status)
  const forecast = isEventOpen(ev) ? forecastEvent(state, ev) : null
  const problems = isEventOpen(ev) ? cardProblems(state, ev) : []
  const kinds: BroadcastKind[] = ['none', 'localTv', 'nationalTv', 'streaming', 'ppv']
  const options = kinds.map((k) => {
    const t = broadcastTerms(state, ev, k, 'public')
    return { kind: k, label: BROADCAST_LABEL[k], available: t.available, reason: t.reason, production: t.production, guaranteed: k === 'streaming' || k === 'ppv' ? 0 : t.fee, note: BROADCAST_NOTE[k] }
  })
  const fin = ev.finance
  const rev = totalRevenue(fin), cost = totalCosts(fin)
  const myFights = Object.values(state.fights).filter((f) => f.status === 'agreed' && f.organiserId === state.playerPromotionId && !f.eventId)
  const addable = editable ? myFights.map((f) => ({
    fightId: f.id, label: `${fighterName(state.fighters[f.sideA.fighterId])} vs ${fighterName(state.fighters[f.sideB.fighterId])}`, reason: eventAcceptsFight(state, ev, f),
  })) : []
  const toGo = ev.day - state.today
  const nextStep = !mine ? '' :
    ev.status === 'cancelled' ? 'This show was cancelled.' :
    ev.status === 'venueBooked' || ev.status === 'cardBuilding' ? (problems.length ? problems[0] : 'The card is ready — set prices and marketing, then put the show on sale.') :
    ev.status === 'onSale' || ev.status === 'promoting' ? 'Tickets are selling. Watch the weekly sales and adjust prices or marketing if needed.' :
    ev.status === 'fightWeek' || ev.status === 'live' ? 'It is show night. Run the card.' :
    ev.status === 'completed' || ev.status === 'settled' || ev.status === 'archived' ? 'The show is over — see the results below.' : `Event is ${Math.ceil(toGo / 7)} weeks away.`
  return {
    id: ev.id, name: ev.name, day: ev.day, weeksAway: Math.max(0, weeksBetween(state.today, ev.day)), status: EVENT_STATUS_LABEL[ev.status], statusKey: ev.status, open: isEventOpen(ev), mine,
    promotion: state.promotions[ev.promotionId]?.name ?? '—', venue: venueView(state, v), card: cardSlots(state, ev), problems,
    quality: { score: Math.round(q.score), label: qualityLabel(q.score), main: Math.round(q.main), coMain: Math.round(q.coMain), depth: Math.round(q.depth), interest: Math.round(interest) },
    prices: ev.prices, refPrices: forecast?.refPrices ?? ev.prices, marketing: ev.marketing,
    broadcast: { kind: ev.broadcast.kind, ppvPrice: ev.broadcast.ppvPrice, options }, sponsor: ev.sponsor, forecast, sales: salesView(state, ev),
    finance: { revenue: fin.revenue, costs: fin.costs, totalRevenue: rev, totalCosts: cost, profit: rev - cost },
    result: ev.result ?? null,
    riserNames: (ev.result?.risers ?? []).map((r) => ({ name: state.fighters[r.fighterId] ? fighterName(state.fighters[r.fighterId]) : 'Unknown', delta: r.delta })),
    cancelReason: ev.cancelReason,
    can: {
      editCard: editable, editMoney: editable, putOnSale: mine && ev.status === 'cardBuilding' && problems.length === 0,
      cancel: mine && ['planning', 'venueBooked', 'cardBuilding', 'onSale', 'promoting', 'fightWeek'].includes(ev.status), run: mine && ['fightWeek', 'live'].includes(ev.status),
      sponsors: mine && isEventOpen(ev) && !['fightWeek', 'live'].includes(ev.status),
    },
    nextStep, addable,
  }
}

export interface VenueFit { venueId: Id; name: string; city: string; tierLabel: string; capacity: number; hireCost: number; fill: { lo: number; hi: number }; profit: { lo: number; hi: number }; verdict: 'too small' | 'good fit' | 'too big' | 'loses money'; free: boolean }

/** How would THIS card do in each venue? Public forecast only. */
export function venueFits(state: GameState, eventId: Id): VenueFit[] {
  const ev = state.events[eventId]
  if (!ev) return []
  return Object.values(state.venues).sort((a, b) => a.capacity - b.capacity).map((v) => {
    const alt = { ...ev, venueId: v.id, city: v.city, country: v.country }
    const f = forecastEvent(state, alt)
    const mid = (f.fill.lo + f.fill.hi) / 2
    return {
      venueId: v.id, name: v.name, city: v.city, tierLabel: TIER_LABEL[v.tier], capacity: v.capacity, hireCost: hireFor(state, v, state.playerPromotionId), fill: f.fill, profit: f.profit,
      verdict: mid > 0.97 ? 'too small' : mid < 0.5 ? 'too big' : f.profit.hi < 0 ? 'loses money' : 'good fit', free: !venueBookedOn(state, v.id, ev.day, ev.id),
    }
  })
}

export interface DashboardEvent {
  next: EventListItem | null
  forecastProfit: { lo: number; hi: number } | null
  risk: Risk | null
  actions: string[]
  openCount: number
}

export function dashboardEvent(state: GameState): DashboardEvent {
  const open = playerOpenEvents(state).sort((a, b) => a.day - b.day)
  const ev = open[0]
  if (!ev) return { next: null, forecastProfit: null, risk: null, actions: ['Book a venue and build your first show.'], openCount: 0 }
  const view = eventView(state, ev.id)!
  const actions: string[] = []
  if (view.problems.length) actions.push(view.problems[0])
  if (ev.status === 'cardBuilding' && !view.problems.length) actions.push('Put the show on sale')
  if (ev.status !== 'venueBooked' && ev.broadcast.kind === 'none' && ev.status !== 'fightWeek') actions.push('Consider a broadcast deal')
  if (ev.marketing.level === 'none') actions.push('No marketing is planned')
  if (view.can.run) actions.push('Run the show')
  return { next: eventListItem(state, ev), forecastProfit: view.forecast?.profit ?? null, risk: view.forecast?.risk ?? null, actions, openCount: open.length }
}

export interface CalendarEntry { day: number; kind: 'event' | 'fight'; id: Id; label: string; sub: string; mine: boolean; status: string }

/** Everything dated in the next year or so, for the calendar. */
export function calendarEntries(state: GameState): CalendarEntry[] {
  const out: CalendarEntry[] = []
  for (const ev of Object.values(state.events)) {
    if (ev.status === 'cancelled' || ev.status === 'archived') continue
    if (ev.day < state.today - 120) continue
    out.push({ day: ev.day, kind: 'event', id: ev.id, label: ev.name, sub: `${ev.city} · ${state.venues[ev.venueId]?.name ?? ''}`, mine: ev.promotionId === state.playerPromotionId, status: EVENT_STATUS_LABEL[ev.status] })
  }
  void viewsOf; void fightInvolvesPlayer; void ppvRefPrice
  return out.sort((a, b) => a.day - b.day)
}

export { cardProblems }
