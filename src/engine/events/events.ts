/**
 * EVENT OPERATIONS: create, build the card, price, promote, sell, run the night, settle, cancel.
 * Money moves only through eventFinance.receive/spend (→ ledger.post for the player).
 */
import { weightClassLabel } from '../../data/weightClasses'
import { SPONSOR_BRANDS } from '../../data/sponsors'
import { BALANCE as B } from '../balance'
import { weeksBetween } from '../calendar'
import { clamp, fighterName } from '../fighters'
import { transition as fightTransition } from '../fight/lifecycle'
import { cancelFight, fightAvailability, fightInvolvesPlayer, resolveFight } from '../fights'
import { stateIds } from '../ids'
import { canAfford } from '../ledger'
import { postMessage, postNews } from '../messages'
import { keyedRng } from '../rng'
import { sponsorsOnEvent } from '../sponsors'
import { tierAllowsVenue, tierDef, tierNeededForVenue } from '../tiers'
import { receive, spend, emptyFinance, totalCosts, totalRevenue } from '../eventFinance'
import type {
  BoxingEvent, BroadcastKind, Fight, GameState, Id, MarketingLevel, PromoStrategy, SponsorOffer, TicketPrices, Venue,
} from '../types'
import {
  hireFor, atmosphereEstimate, awarenessFor, broadcastTerms, cardFights, cardQuality, demandFor, eventInterest, fightAppeal, forecastEvent, inventory,
  officialsCost, ppvBuysFor, ppvRefPrice, productionCost, salesCurve, viewersFor,
} from './demand'
import { OPEN_EVENT, eventTransition, isEventOpen, isOnSale } from './lifecycle'

const E = B.events
const SAT = 5

export interface EvResult { ok: boolean; error?: string; state: GameState; eventId?: Id }
const bad = (state: GameState, error: string): EvResult => ({ ok: false, error, state })

export function isSaturday(state: GameState, day: number): boolean {
  return (day - state.today) % 7 === SAT
}

export function venueBookedOn(state: GameState, venueId: Id, day: number, exceptEvent?: Id): boolean {
  return Object.values(state.events).some((e) => e.id !== exceptEvent && e.venueId === venueId && e.day === day && e.status !== 'cancelled')
}

export function defaultPrices(): TicketPrices { return { ga: 25, premium: 60, vip: 150 } }

function blankSales() { return { sold: [0, 0, 0] as [number, number, number], weeksOnSale: 0, awareness: 0, momentum: 1, history: [] as number[] } }

// ---------------------------------------------------------------- Creating

export interface CreateEventSpec { name: string; day: number; venueId: Id }

export function playerOpenEvents(state: GameState): BoxingEvent[] {
  return Object.values(state.events).filter((e) => e.promotionId === state.playerPromotionId && isEventOpen(e))
}

/** Create an event and book its venue (pays the rental). */
export function createEventInternal(state: GameState, promotionId: Id, spec: CreateEventSpec, kind: 'player' | 'ai'): BoxingEvent {
  const v = state.venues[spec.venueId]
  const ev: BoxingEvent = {
    id: stateIds(state).next('ev'), promotionId, kind, name: spec.name, day: spec.day, venueId: v.id, city: v.city, country: v.country,
    status: 'planning', card: [], prices: defaultPrices(), marketing: { level: 'none', strategy: 'standard', budget: 0, spent: 0 },
    broadcast: { kind: 'none', ppvPrice: 14.99 }, sponsor: { offers: [], accepted: null }, sales: blankSales(), finance: emptyFinance(),
    settled: false, createdDay: state.today, onSaleDay: null, nextFight: 0, expectedAttendance: 0,
  }
  state.events[ev.id] = ev
  spend(state, ev, 'venue', hireFor(state, v, promotionId), `Venue hire — ${v.name} (${ev.name})`)
  eventTransition(ev, 'venueBooked')
  return ev
}

export function createEvent(input: GameState, spec: CreateEventSpec): EvResult {
  const name = spec.name.trim()
  if (name.length < 3) return bad(input, 'Give the event a name.')
  const v = input.venues[spec.venueId]
  if (!v) return bad(input, 'Choose a venue.')
  const weeks = weeksBetween(input.today, spec.day)
  if (!isSaturday(input, spec.day)) return bad(input, 'Shows take place on Saturdays.')
  if (weeks < E.minLeadWeeks) return bad(input, `Events need at least ${E.minLeadWeeks} weeks' notice.`)
  if (weeks > E.maxLeadWeeks) return bad(input, `You cannot book more than ${E.maxLeadWeeks} weeks ahead.`)
  if (venueBookedOn(input, v.id, spec.day)) return bad(input, 'That venue is already booked on that date.')
  const ptier = input.promotions[input.playerPromotionId].tier
  if (!tierAllowsVenue(ptier, v)) return bad(input, `${v.name} seats ${v.capacity.toLocaleString('en-GB')}. A ${tierDef(ptier).label} promotion can book up to ${tierDef(ptier).maxCapacity.toLocaleString('en-GB')}; it opens up once you are a ${tierDef(tierNeededForVenue(v)).label} promotion.`)
  if (playerOpenEvents(input).length >= 3) return bad(input, 'You can only run three events at once.')
  if (!canAfford(input, hireFor(input, v, input.playerPromotionId))) return bad(input, `The venue hire (£${hireFor(input, v, input.playerPromotionId).toLocaleString('en-GB')}) is more than you have in the bank.`)
  if (playerOpenEvents(input).some((e) => Math.abs(e.day - spec.day) < 7)) return bad(input, 'Leave at least a week between your shows.')
  const state = structuredClone(input)
  const ev = createEventInternal(state, state.playerPromotionId, { ...spec, name }, 'player')
  return { ok: true, state, eventId: ev.id }
}

// ------------------------------------------------------------- Card building

export function eventAcceptsFight(state: GameState, ev: BoxingEvent, fight: Fight): string | null {
  const v = state.venues[ev.venueId]
  if (!['venueBooked', 'cardBuilding', 'onSale', 'promoting'].includes(ev.status)) return 'The card is locked.'
  if (ev.promotionId !== fight.organiserId) return 'That fight belongs to a different promotion.'
  if (fight.status !== 'agreed') return 'Only fights with agreed terms can go on a card.'
  if (cardFights(state, ev).length >= v.maxFights) return `${v.name} cannot host more than ${v.maxFights} fights.`
  const ids = new Set(cardFights(state, ev).flatMap((f) => [f.sideA.fighterId, f.sideB.fighterId]))
  if (ids.has(fight.sideA.fighterId) || ids.has(fight.sideB.fighterId)) return 'A fighter cannot appear twice on one card.'
  for (const side of [fight.sideA, fight.sideB]) {
    const f = state.fighters[side.fighterId]
    const av = fightAvailability(state, f, ev.day, fight.id)
    if (!av.ok) return `${fighterName(f)}: ${av.reason}`
  }
  return null
}

export function addFight(input: GameState, eventId: Id, fightId: Id): EvResult {
  const ev0 = input.events[eventId], f0 = input.fights[fightId]
  if (!ev0 || !f0) return bad(input, 'Unknown event or fight.')
  const err = eventAcceptsFight(input, ev0, f0)
  if (err) return bad(input, err)
  const state = structuredClone(input)
  attachFight(state, state.events[eventId], state.fights[fightId])
  return { ok: true, state, eventId }
}

/** Put an agreed fight on the card (also used by the AI). */
export function attachFight(state: GameState, ev: BoxingEvent, fight: Fight): void {
  fight.eventId = ev.id
  fight.day = ev.day
  fight.venueId = ev.venueId
  fight.city = ev.city
  fight.country = ev.country
  fightTransition(fight, 'scheduled')
  state.fighters[fight.sideA.fighterId].activeFightId = fight.id
  state.fighters[fight.sideB.fighterId].activeFightId = fight.id
  const fights = cardFights(state, ev)
  if (ev.manualOrder) ev.card.unshift(fight.id)
  else {
    // keep the best fight last
    const ap = fightAppeal(state, fight)
    let idx = fights.findIndex((f) => fightAppeal(state, f) > ap)
    if (idx < 0) idx = fights.length
    const beforeId = fights[idx]?.id
    const at = beforeId ? ev.card.indexOf(beforeId) : ev.card.length
    ev.card.splice(at, 0, fight.id)
  }
  if (ev.status === 'venueBooked') eventTransition(ev, 'cardBuilding')
}

export function removeFight(input: GameState, eventId: Id, fightId: Id): EvResult {
  const ev0 = input.events[eventId], f0 = input.fights[fightId]
  if (!ev0 || !f0 || f0.eventId !== eventId) return bad(input, 'That fight is not on this card.')
  if (!['cardBuilding', 'onSale', 'promoting'].includes(ev0.status)) return bad(input, 'The card is locked.')
  const state = structuredClone(input)
  const ev = state.events[eventId], fight = state.fights[fightId]
  ev.card = ev.card.filter((id) => id !== fightId)
  if (fight.status === 'scheduled') {
    fightTransition(fight, 'agreed')
    fight.eventId = undefined
    fight.day = 0
  } else cancelFight(state, fight, 'taken off the card', 12) // already in camp: the opponent will not forget
  return { ok: true, state, eventId }
}

export function moveFight(input: GameState, eventId: Id, fightId: Id, dir: -1 | 1): EvResult {
  const ev0 = input.events[eventId]
  if (!ev0 || !['cardBuilding', 'onSale', 'promoting'].includes(ev0.status)) return bad(input, 'The card is locked.')
  const i = ev0.card.indexOf(fightId)
  const j = i + dir
  if (i < 0 || j < 0 || j >= ev0.card.length) return bad(input, 'Cannot move it further.')
  const state = structuredClone(input)
  const ev = state.events[eventId]
  ;[ev.card[i], ev.card[j]] = [ev.card[j], ev.card[i]]
  ev.manualOrder = true
  return { ok: true, state, eventId }
}

/** Put a fight in a given slot: 'main' = last, 'coMain' = second last. */
export function setSlot(input: GameState, eventId: Id, fightId: Id, slot: 'main' | 'coMain'): EvResult {
  const ev0 = input.events[eventId]
  if (!ev0 || !['cardBuilding', 'onSale', 'promoting'].includes(ev0.status)) return bad(input, 'The card is locked.')
  if (!ev0.card.includes(fightId)) return bad(input, 'That fight is not on the card.')
  const state = structuredClone(input)
  const ev = state.events[eventId]
  ev.card = ev.card.filter((id) => id !== fightId)
  if (slot === 'main') ev.card.push(fightId)
  else ev.card.splice(Math.max(0, ev.card.length - 1), 0, fightId)
  ev.manualOrder = true
  return { ok: true, state, eventId }
}

// -------------------------------------------------------------- Price/promote

export function setPrices(input: GameState, eventId: Id, prices: TicketPrices): EvResult {
  const ev0 = input.events[eventId]
  if (!ev0 || !['venueBooked', 'cardBuilding', 'onSale', 'promoting'].includes(ev0.status)) return bad(input, 'Prices can no longer be changed.')
  const p = { ga: Math.round(prices.ga), premium: Math.round(prices.premium), vip: Math.round(prices.vip) }
  if (p.ga < 5 || p.ga > 500 || p.premium < p.ga || p.vip < p.premium) return bad(input, 'Prices must rise from general admission to premium to VIP (GA £5–£500).')
  const state = structuredClone(input)
  state.events[eventId].prices = p
  return { ok: true, state, eventId }
}

export function setMarketing(input: GameState, eventId: Id, patch: { level?: MarketingLevel; strategy?: PromoStrategy; budget?: number }): EvResult {
  const ev0 = input.events[eventId]
  if (!ev0 || !['venueBooked', 'cardBuilding', 'onSale', 'promoting'].includes(ev0.status)) return bad(input, 'Marketing can no longer be changed.')
  const state = structuredClone(input)
  const ev = state.events[eventId]
  if (patch.strategy) ev.marketing.strategy = patch.strategy
  if (patch.level) {
    ev.marketing.level = patch.level
    if (patch.level !== 'major') ev.marketing.budget = E.marketing.budgets[patch.level]
    else ev.marketing.budget = Math.max(E.marketing.budgets.major, Math.min(250_000, Math.round(patch.budget ?? E.marketing.budgets.major)))
  } else if (patch.budget !== undefined) {
    ev.marketing.budget = clamp(Math.round(patch.budget), 0, 250_000)
    ev.marketing.level = ev.marketing.budget >= E.marketing.budgets.major ? 'major' : ev.marketing.budget >= E.marketing.budgets.heavy ? 'heavy' : ev.marketing.budget >= E.marketing.budgets.standard ? 'standard' : ev.marketing.budget > 0 ? 'low' : 'none'
  }
  ev.marketing.budget = Math.max(ev.marketing.budget, ev.marketing.spent) // money already spent stays spent
  return { ok: true, state, eventId }
}

export function setBroadcast(input: GameState, eventId: Id, kind: BroadcastKind, ppvPrice?: number): EvResult {
  const ev0 = input.events[eventId]
  if (!ev0 || !['venueBooked', 'cardBuilding', 'onSale', 'promoting'].includes(ev0.status)) return bad(input, 'Broadcast can no longer be changed.')
  const t = broadcastTerms(input, ev0, kind, 'public')
  if (!t.available) return bad(input, t.reason ?? 'Not available.')
  const state = structuredClone(input)
  const ev = state.events[eventId]
  ev.broadcast.kind = kind
  if (ppvPrice !== undefined) ev.broadcast.ppvPrice = clamp(Math.round(ppvPrice * 100) / 100, 5, 60)
  else if (kind === 'ppv') ev.broadcast.ppvPrice = ppvRefPrice(eventInterest(state, ev))
  return { ok: true, state, eventId }
}

// ------------------------------------------------------------------ Sponsors

export function generateSponsorOffers(state: GameState, ev: BoxingEvent): SponsorOffer[] {
  const r = keyedRng(state.seed, 'sponsors', ev.id, ev.card.length)
  const fc = forecastEvent(state, ev)
  const p = state.promotions[ev.promotionId]
  const gate = (fc.ticketRevenue.lo + fc.ticketRevenue.hi) / 2
  const q = cardQuality(state, ev)
  const brands = r.shuffle(SPONSOR_BRANDS).slice(0, E.sponsor.maxOffers)
  const mainPop = q.mainFight ? Math.max(state.fighters[q.mainFight.sideA.fighterId].popularity, state.fighters[q.mainFight.sideB.fighterId].popularity) : 20
  return brands.map((brand, i) => {
    const fee = Math.max(300, Math.round((E.sponsor.baseFactor * (ev.promotionId === state.playerPromotionId ? B.difficulty[state.settings.difficulty].sponsor : 1) * gate * (0.6 + 0.8 * (p.reputation / 100)) * (0.7 + 0.6 * r.next()) * (0.8 + 0.4 * (q.score / 100))) / 50) * 50)
    const att = Math.round((fc.attendance.lo + fc.attendance.hi) / 2 * 0.85 / 10) * 10
    return {
      id: `${ev.id}-s${i}`, brand, fixedFee: fee,
      attendanceBonus: att > 50 ? { threshold: att, amount: Math.round((fee * 0.3) / 50) * 50 } : null,
      qualityBonus: { threshold: 50 + Math.round(r.next() * 15), amount: Math.round((fee * 0.25) / 50) * 50 },
      minMainPopularity: Math.max(10, Math.min(Math.round(mainPop * (0.6 + 0.5 * r.next())), 60)),
    }
  })
}

export function refreshSponsors(input: GameState, eventId: Id): EvResult {
  const ev0 = input.events[eventId]
  if (!ev0 || !isEventOpen(ev0) || ev0.status === 'fightWeek' || ev0.status === 'live') return bad(input, 'Sponsors can no longer be arranged.')
  if (ev0.card.length === 0) return bad(input, 'Sponsors want to see a card first.')
  const state = structuredClone(input)
  const ev = state.events[eventId]
  if (!ev.sponsor.accepted) ev.sponsor.offers = generateSponsorOffers(state, ev)
  return { ok: true, state, eventId }
}

export function acceptSponsor(input: GameState, eventId: Id, offerId: Id | null): EvResult {
  const ev0 = input.events[eventId]
  if (!ev0 || !isEventOpen(ev0) || ev0.status === 'fightWeek' || ev0.status === 'live') return bad(input, 'Sponsors can no longer be arranged.')
  const state = structuredClone(input)
  const ev = state.events[eventId]
  if (offerId === null) { ev.sponsor.accepted = null; return { ok: true, state, eventId } }
  const offer = ev.sponsor.offers.find((o) => o.id === offerId)
  if (!offer) return bad(input, 'That offer has expired.')
  ev.sponsor.accepted = offer
  return { ok: true, state, eventId }
}

// ------------------------------------------------------------- Putting on sale

export function cardProblems(state: GameState, ev: BoxingEvent): string[] {
  const v = state.venues[ev.venueId]
  const fights = cardFights(state, ev)
  const out: string[] = []
  if (fights.length < v.minFights) out.push(`${v.name} needs at least ${v.minFights} fights (you have ${fights.length}).`)
  if (fights.length > v.maxFights) out.push(`Too many fights for ${v.name} (max ${v.maxFights}).`)
  return out
}

export function putOnSale(input: GameState, eventId: Id): EvResult {
  const ev0 = input.events[eventId]
  if (!ev0) return bad(input, 'Unknown event.')
  if (ev0.status !== 'cardBuilding') return bad(input, 'Build the card first.')
  const problems = cardProblems(input, ev0)
  if (problems.length) return bad(input, problems[0])
  if (weeksBetween(input.today, ev0.day) < 2) return bad(input, 'Too late to go on sale.')
  const state = structuredClone(input)
  startSales(state, state.events[eventId])
  return { ok: true, state, eventId }
}

export function startSales(state: GameState, ev: BoxingEvent): void {
  eventTransition(ev, 'onSale')
  ev.onSaleDay = state.today
  const fc = forecastEvent(state, ev)
  ev.expectedAttendance = Math.round((fc.attendance.lo + fc.attendance.hi) / 2)
  ev.forecast = { att: [Math.round(fc.attendance.lo), Math.round(fc.attendance.hi)], profit: [Math.round(fc.profit.lo), Math.round(fc.profit.hi)] }
  if (!ev.sponsor.accepted && ev.sponsor.offers.length === 0) ev.sponsor.offers = generateSponsorOffers(state, ev)
  if (ev.promotionId === state.playerPromotionId) {
    postMessage(state, { from: 'Events', category: 'world', priority: 'normal', subject: `Tickets on sale: ${ev.name}`, body: `${ev.name} is on sale. Watch sales each week and adjust prices or marketing if it is slow.`, link: { kind: 'event', id: ev.id } })
  }
}

// ---------------------------------------------------------------- Weekly sales

function weeksToShow(state: GameState, ev: BoxingEvent): number {
  return Math.max(0, Math.ceil((ev.day - state.today) / 7))
}

export function updateSales(state: GameState, ev: BoxingEvent, final = false): void {
  if (ev.onSaleDay === null) return
  const v = state.venues[ev.venueId]
  const total = Math.max(1, Math.ceil((ev.day - ev.onSaleDay) / 7))
  const left = final ? 0 : weeksToShow(state, ev)
  const elapsed = total - left
  const x = final ? 1 : clamp(elapsed / total, 0, 1)
  ev.sales.weeksOnSale = elapsed
  const d = demandFor(state, ev, 'actual', ev.prices, ev.marketing.spent)
  const cur = salesCurve(x, d.interest)
  const inv = inventory(v)
  const target: [number, number, number] = [Math.min(inv[0], Math.round(d.ga * cur)), Math.min(inv[1], Math.round(d.premium * cur)), Math.min(inv[2], Math.round(d.vip * cur))]
  const before = ev.sales.sold[0] + ev.sales.sold[1] + ev.sales.sold[2]
  const delta: [number, number, number] = [0, 1, 2].map((i) => Math.max(0, target[i] - ev.sales.sold[i])) as [number, number, number]
  const revenue = delta[0] * ev.prices.ga + delta[1] * ev.prices.premium + delta[2] * ev.prices.vip
  if (revenue > 0) receive(state, ev, 'tickets', revenue, `Ticket sales — ${ev.name}`)
  for (let i = 0; i < 3; i++) ev.sales.sold[i] += delta[i]
  const after = ev.sales.sold[0] + ev.sales.sold[1] + ev.sales.sold[2]
  const prevWeek = ev.sales.history.length ? ev.sales.history[ev.sales.history.length - 1] - (ev.sales.history[ev.sales.history.length - 2] ?? 0) : 0
  ev.sales.momentum = Math.round(((after - before) / Math.max(1, prevWeek || after - before || 1)) * 100) / 100
  ev.sales.history.push(after)
  ev.sales.awareness = Math.round(awarenessFor(state, ev, ev.marketing.spent))
  if (after >= v.capacity && before < v.capacity && ev.promotionId === state.playerPromotionId) {
    postMessage(state, { from: 'Events', category: 'world', priority: 'important', key: `soldout-${ev.id}`, cooldownWeeks: 60, subject: `SOLD OUT: ${ev.name}`, body: `Every seat for ${ev.name} has gone. Next time, consider a bigger venue or higher prices.`, link: { kind: 'event', id: ev.id } })
  }
}

function spendMarketing(state: GameState, ev: BoxingEvent, final = false): void {
  const left = Math.max(1, weeksToShow(state, ev))
  const remaining = ev.marketing.budget - ev.marketing.spent
  if (remaining <= 0) return
  const slice = final ? remaining : Math.ceil(remaining / left)
  spend(state, ev, 'marketing', slice, `Marketing — ${ev.name}`)
  ev.marketing.spent += slice
}

// ------------------------------------------------------------------ Weekly tick

/** Called every week after fights have progressed. Moves events along and runs AI events on show night. */
export function processEvents(state: GameState): void {
  for (const ev of Object.values(state.events)) {
    if (!isEventOpen(ev)) { maybeArchive(state, ev); continue }
    const mine = ev.promotionId === state.playerPromotionId
    // Fights that were cancelled drop off the card.
    ev.card = ev.card.filter((id) => state.fights[id] && state.fights[id].status !== 'cancelled')
    const toGo = ev.day - state.today
    if (ev.status === 'fightWeek' || ev.status === 'live') continue

    if (toGo < 7) {
      // Show week.
      if (ev.status === 'cardBuilding' || ev.status === 'venueBooked') {
        const fights = cardFights(state, ev)
        if (fights.length === 0) { cancelEvent(state, ev, 'there was no card'); continue }
      }
      if (ev.status === 'cardBuilding') startSalesLate(state, ev)
      if (ev.status === 'venueBooked') { cancelEvent(state, ev, 'there was no card'); continue }
      if ((ev.status === 'onSale' || ev.status === 'promoting') && cardFights(state, ev).length === 0) { cancelEvent(state, ev, 'every fight on the card fell through'); continue }
      if (ev.status === 'onSale' || ev.status === 'promoting') enterFightWeek(state, ev)
      continue
    }
    if (ev.status === 'cardBuilding' && toGo <= 21) {
      if (mine && cardProblems(state, ev).length === 0) { startSalesLate(state, ev) } // never leave a show off sale by accident
      else if (mine) postMessage(state, { from: 'Events', category: 'world', priority: 'important', key: `late-${ev.id}`, cooldownWeeks: 4, subject: `${ev.name} is not ready`, body: `${ev.name} is ${Math.ceil(toGo / 7)} weeks away and the card still has problems: ${cardProblems(state, ev)[0]}`, link: { kind: 'event', id: ev.id } })
    }
    if (isOnSale(ev)) {
      if (ev.status === 'onSale' && toGo <= E.promotingWeeks * 7 && ev.marketing.budget > 0) eventTransition(ev, 'promoting')
      spendMarketing(state, ev)
      updateSales(state, ev)
    }
    // A card that has lost too many fights: warn / cancel.
    if (isOnSale(ev)) {
      const v = state.venues[ev.venueId]
      const n = cardFights(state, ev).length
      if (n < Math.max(1, Math.floor(v.minFights / 2)) && toGo <= 14) { cancelEvent(state, ev, 'too many fights fell through'); continue }
    }
  }
}

function startSalesLate(state: GameState, ev: BoxingEvent): void {
  if (ev.status !== 'cardBuilding') return
  startSales(state, ev)
  if (ev.promotionId === state.playerPromotionId) postMessage(state, { from: 'Events', category: 'world', priority: 'important', subject: `${ev.name} put on sale automatically`, body: 'Tickets were opened late with your current prices so the show is not left empty.', link: { kind: 'event', id: ev.id } })
}

function enterFightWeek(state: GameState, ev: BoxingEvent): void {
  updateSales(state, ev, true)
  spendMarketing(state, ev, true)
  const v = state.venues[ev.venueId]
  const bt = broadcastTerms(state, ev, ev.broadcast.kind, 'actual')
  spend(state, ev, 'production', productionCost(v), `Production — ${ev.name}`)
  if (bt.production > 0) spend(state, ev, 'broadcast', bt.production, `Broadcast production — ${ev.name}`)
  eventTransition(ev, 'fightWeek')
  if (ev.kind === 'ai') { runWholeEvent(state, ev); return }
  postMessage(state, {
    from: 'Events', category: 'world', priority: 'urgent', key: `evnight-${ev.id}`, cooldownWeeks: 20,
    subject: `Fight week: ${ev.name}`, body: `${ev.name} is this Saturday at ${v.name}. ${ev.sales.sold[0] + ev.sales.sold[1] + ev.sales.sold[2]} tickets sold. Open the event to run the night.`, link: { kind: 'event', id: ev.id },
  })
}

// ------------------------------------------------------------------ Event night

function pendingFights(state: GameState, ev: BoxingEvent): Fight[] {
  return ev.card.map((id) => state.fights[id]).filter((f): f is Fight => !!f && f.status === 'fightNight')
}

function ensureLive(ev: BoxingEvent): void {
  if (ev.status === 'fightWeek') eventTransition(ev, 'live')
}

/** Resolve the next fight on the card. Completes and settles the event after the last one. */
export function runNextFightInternal(state: GameState, ev: BoxingEvent): Fight | null {
  ensureLive(ev)
  const next = pendingFights(state, ev)[0]
  if (!next) { if (ev.status === 'live') finishEvent(state, ev); return null }
  resolveFight(state, next)
  ev.nextFight = ev.card.indexOf(next.id) + 1
  if (pendingFights(state, ev).length === 0) finishEvent(state, ev)
  return next
}

export function runWholeEvent(state: GameState, ev: BoxingEvent): void {
  ensureLive(ev)
  let guard = 0
  while (ev.status === 'live' && guard++ < 20) runNextFightInternal(state, ev)
  if (ev.status === 'live') finishEvent(state, ev)
}

export function runNextFight(input: GameState, eventId: Id): EvResult & { fightId?: Id } {
  const ev0 = input.events[eventId]
  if (!ev0 || !['fightWeek', 'live'].includes(ev0.status)) return bad(input, 'This event is not ready to run.')
  const state = structuredClone(input)
  const f = runNextFightInternal(state, state.events[eventId])
  return { ok: true, state, eventId, fightId: f?.id }
}

/** Resolve everything except (optionally) the main event. */
export function quickSimRemaining(input: GameState, eventId: Id, keepMain = true): EvResult {
  const ev0 = input.events[eventId]
  if (!ev0 || !['fightWeek', 'live'].includes(ev0.status)) return bad(input, 'This event is not ready to run.')
  const state = structuredClone(input)
  const ev = state.events[eventId]
  ensureLive(ev)
  let guard = 0
  while (ev.status === 'live' && guard++ < 20) {
    const pend = pendingFights(state, ev)
    if (keepMain && pend.length <= 1 && pend[0]?.id === ev.card[ev.card.length - 1]) break
    runNextFightInternal(state, ev)
  }
  return { ok: true, state, eventId }
}

export function eventOfFight(state: GameState, fight: Fight): BoxingEvent | null {
  return fight.eventId ? state.events[fight.eventId] ?? null : null
}

// --------------------------------------------------------------- Settlement

const fightQuality = (f: Fight): number => {
  const r = f.result
  if (!r) return 0
  const stop = ['KO', 'TKO', 'RTD', 'INJ'].includes(r.method)
  return 0.4 * (1 - Math.abs(r.perf[0] - r.perf[1])) + 0.25 * Math.min(1, (r.kd[0] + r.kd[1]) / 2) + 0.2 * (stop ? 1 : 0.3) + 0.15 * Math.min(1, r.upset * 1.5)
}

/** All fights run: take the gate in, pay the night's bills, book the broadcast/PPV/sponsor money, update reputations. */
export function finishEvent(state: GameState, ev: BoxingEvent): void {
  if (ev.settled) return
  eventTransition(ev, 'completed')
  const v = state.venues[ev.venueId]
  const p = state.promotions[ev.promotionId]
  const mine = ev.promotionId === state.playerPromotionId
  const fights = cardFights(state, ev)
  const attendance = ev.sales.sold[0] + ev.sales.sold[1] + ev.sales.sold[2]
  const fill = attendance / v.capacity
  const q = cardQuality(state, ev)

  spend(state, ev, 'security', attendance * E.costs.securityPerHead, `Security & stewarding — ${ev.name}`)
  spend(state, ev, 'officials', officialsCost(fights.length), `Officials, medical & insurance — ${ev.name}`)
  // Sanctioning body, licensing and insurance levy on the gate.
  spend(state, ev, 'officials', ev.finance.revenue.tickets * E.costs.sanctionShare, `Sanctioning & licensing levy — ${ev.name}`)

  // Broadcast and PPV.
  let ppvBuys = 0
  const viewers = ev.broadcast.kind === 'none' ? 0 : viewersFor(state, ev, 'actual')
  if (ev.broadcast.kind === 'ppv') {
    ppvBuys = ppvBuysFor(state, ev, 'actual')
    const ppvRev = ppvBuys * ev.broadcast.ppvPrice * E.ppv.promoterShare
    receive(state, ev, 'ppv', ppvRev, `PPV revenue — ${ev.name} (${ppvBuys.toLocaleString('en-GB')} buys)`)
    // Headliners on a PPV share deal take their cut of what the promoter receives.
    const mainF = fights[fights.length - 1]
    if (mainF) for (const side of [mainF.sideA, mainF.sideB]) {
      const c = state.fighters[side.fighterId].contractId ? state.contracts[state.fighters[side.fighterId].contractId!] : null
      if (c && c.promotionId === ev.promotionId && c.ppvShare > 0) spend(state, ev, 'bonuses', ppvRev * c.ppvShare, `PPV share — ${fighterName(state.fighters[side.fighterId])}`)
    }
  } else if (ev.broadcast.kind !== 'none') {
    const bt = broadcastTerms(state, ev, ev.broadcast.kind, 'actual')
    if (bt.fee > 0) receive(state, ev, 'broadcast', bt.fee, `Broadcast fee — ${ev.name}`)
  }

  // Event quality as it actually played out (outcomes only).
  const weights = fights.map((_, i) => (i === fights.length - 1 ? 0.5 : i === fights.length - 2 ? 0.2 : 0.3 / Math.max(1, fights.length - 2)))
  const wsum = weights.reduce((a, b) => a + b, 0) || 1
  const realized = fights.reduce((n, f, i) => n + fightQuality(f) * weights[i], 0) / wsum
  const upsets = fights.filter((f) => (f.result?.upset ?? 0) > 0.62).length
  const stoppages = fights.filter((f) => ['KO', 'TKO', 'RTD'].includes(f.result?.method ?? '')).length
  const interest = eventInterest(state, ev)
  const atmosphere = clamp(atmosphereEstimate(q.score, interest, fill, v) + 5 * Math.min(2, upsets) + 3 * Math.min(3, stoppages) + 8 * (realized - 0.4), 0, 100)

  // Sponsor money (needs the event's reputation score, so compute that first from everything except the sponsor).
  const mainFight = fights[fights.length - 1]
  const mainPop = mainFight ? Math.max(state.fighters[mainFight.sideA.fighterId].popularity, state.fighters[mainFight.sideB.fighterId].popularity) : 0
  const revenueSoFar = totalRevenue(ev.finance)
  const costSoFar = totalCosts(ev.finance)
  const profitFactor = clamp(50 + ((revenueSoFar - costSoFar) / Math.max(1, costSoFar)) * 50, 0, 100)
  const reputation = Math.round(clamp(0.3 * Math.min(100, fill * 100) + 0.25 * realized * 100 + 0.2 * q.score + 0.15 * profitFactor + 0.1 * atmosphere, 0, 100))
  const sp = ev.sponsor.accepted
  if (sp) {
    let fee = mainPop >= sp.minMainPopularity ? sp.fixedFee : Math.round(sp.fixedFee * 0.5)
    if (sp.attendanceBonus && attendance >= sp.attendanceBonus.threshold) fee += sp.attendanceBonus.amount
    if (sp.qualityBonus && reputation >= sp.qualityBonus.threshold) fee += sp.qualityBonus.amount
    receive(state, ev, 'sponsorship', fee, `Sponsorship — ${sp.brand} (${ev.name})`)
  }

  const revenue = totalRevenue(ev.finance), costs = totalCosts(ev.finance)
  const profit = revenue - costs

  // Reputation and fan growth scale with the size of the stage.
  const size = { local: 0.5, regional: 0.8, national: 1.1, arena: 1.5, stadium: 2 }[v.tier]
  // Momentum: one show moves the promotion's recent form by a third of the way; reputation follows form, so a single great
  // night or a single disaster nudges rather than swings. A genuine disaster (empty building, heavy loss) still bites.
  p.stats.form = clamp(p.stats.form * 0.65 + reputation * 0.35, 0, 100)
  let repDelta = ((p.stats.form - 50) / 50) * 1.3 * size
  if (profit < 0 && fill < 0.35) repDelta -= 0.6 * size
  repDelta = clamp(repDelta, -2.2, 2.6)
  const prevBest = p.stats.bestAttendance
  p.reputation = clamp(p.reputation + repDelta, 0, 100)
  const fanDelta = Math.round(attendance * (0.2 + reputation / 100) + ppvBuys * 0.15 + viewers * 0.02) - (profit < 0 && fill < 0.35 ? Math.round(p.fanbase * 0.002) : 0)
  p.fanbase = Math.max(100, p.fanbase + fanDelta)
  p.stats.events++
  p.stats.attendance += attendance
  p.stats.profit += profit
  p.stats.revenue = (p.stats.revenue ?? 0) + revenue
  p.stats.lastEventDay = ev.day
  p.stats.bestAttendance = Math.max(prevBest, attendance)
  const gate = ev.finance.revenue.tickets
  p.stats.bestGate = Math.max(p.stats.bestGate, gate)

  const notable: string[] = []
  for (const f of fights) {
    const r = f.result
    if (!r) continue
    const A = fighterName(state.fighters[f.sideA.fighterId]), Bn = fighterName(state.fighters[f.sideB.fighterId])
    const W = r.winner === 0 ? A : Bn
    if (r.upset > 0.62 && r.winner !== null) notable.push(`Upset: ${W} stunned the favourite`)
    else if (r.method === 'KO' && r.round <= 2) notable.push(`${W} knocked out ${r.winner === 0 ? Bn : A} in round ${r.round}`)
    else if (r.kd[0] + r.kd[1] >= 3) notable.push(`${A} vs ${Bn} was a war — ${r.kd[0] + r.kd[1]} knockdowns`)
  }
  if (attendance > prevBest && p.stats.events > 1) notable.push(`Record crowd for ${p.name}: ${attendance.toLocaleString('en-GB')}`)
  if (attendance >= v.capacity) notable.push('Sold out')
  if (ppvBuys >= 15000) notable.push(`${Math.round(ppvBuys / 1000)}k PPV buys`)
  if (profit < 0 && fill < 0.35 && v.capacity >= 3000) notable.push('A half-empty building hurt the atmosphere')

  const risers = fights.flatMap((f) => [0, 1].map((i) => ({ fighterId: i === 0 ? f.sideA.fighterId : f.sideB.fighterId, delta: f.result?.dPop[i] ?? 0 })))
    .sort((a, b) => b.delta - a.delta).slice(0, 3)

  ev.result = {
    attendance, ppvBuys, viewers, revenue, costs, profit, atmosphere: Math.round(atmosphere), reputation, promoRepDelta: Math.round(repDelta * 10) / 10,
    fanDelta, cardQuality: Math.round(q.score), importance: Math.round(clamp(0.5 * q.score + 6 * v.prestige + 0.2 * reputation, 0, 100)), notable: notable.slice(0, 5), risers, settledDay: state.today,
  }
  ev.settled = true
  eventTransition(ev, 'settled')
  if (mine) sponsorsOnEvent(state, ev)
  eventNews(state, ev, p.name, attendance, ppvBuys, profit, fill)
  if (mine) {
    postMessage(state, {
      from: 'Events', category: 'world', priority: 'important', subject: `${ev.name} settled: ${profit >= 0 ? 'profit' : 'loss'} £${Math.abs(profit).toLocaleString('en-GB')}`,
      body: `${attendance.toLocaleString('en-GB')} in the building (${Math.round(fill * 100)}%). Revenue £${revenue.toLocaleString('en-GB')}, costs £${costs.toLocaleString('en-GB')}. Event reputation ${reputation}/100; your promotion's reputation ${repDelta >= 0 ? '+' : ''}${(Math.round(repDelta * 10) / 10)}.`,
      link: { kind: 'event', id: ev.id },
    })
  }
}

function eventNews(state: GameState, ev: BoxingEvent, promoName: string, attendance: number, ppvBuys: number, profit: number, fill: number): void {
  const v = state.venues[ev.venueId]
  const imp = ev.result?.importance ?? 0
  const mine = ev.promotionId === state.playerPromotionId
  const base = { category: 'event' as const, eventId: ev.id, importance: imp }
  if (attendance >= v.capacity && v.capacity >= 3000) postNews(state, { ...base, headline: `SELL-OUT IN ${v.city.toUpperCase()}: ${promoName} fill ${v.name} (${attendance.toLocaleString('en-GB')})` })
  else if (ev.result && ev.result.notable.some((n) => n.startsWith('Record crowd'))) postNews(state, { ...base, headline: `RECORD CROWD IN ${v.city.toUpperCase()}: ${promoName} report ${attendance.toLocaleString('en-GB')} tickets` })
  else if (attendance >= 1500 || mine) postNews(state, { ...base, headline: `${promoName} draw ${attendance.toLocaleString('en-GB')} to ${v.name}, ${v.city}` })
  if (ppvBuys >= 20000) postNews(state, { ...base, headline: `Massive PPV success: ${ev.name} sells ${Math.round(ppvBuys / 1000)}k buys` })
  if (profit < 0 && fill < 0.35 && v.capacity >= 3000) postNews(state, { ...base, headline: `Financial disaster: ${promoName} lose heavily after weak attendance at ${ev.name}` })
}

// ------------------------------------------------------------- Cancellation

export function cancelEvent(state: GameState, ev: BoxingEvent, reason: string): void {
  if (!isEventOpen(ev) || ev.status === 'live') return
    const mine = ev.promotionId === state.playerPromotionId
  const weeks = weeksBetween(state.today, ev.day)
  eventTransition(ev, 'cancelled')
  ev.cancelReason = reason
  // Ticket-holders are refunded in full.
  const gate = ev.finance.revenue.tickets
  if (gate > 0) receive(state, ev, 'tickets', -gate, `Ticket refunds — ${ev.name}`)
  const refund = Math.round(ev.finance.costs.venue * (weeks >= E.cancelEarlyWeeks ? E.cancelRefund.early : E.cancelRefund.late))
  if (refund > 0 && ev.finance.costs.venue > 0) spend(state, ev, 'venue', -refund, `Venue refund — ${ev.name}`)
  // Fights come off the card: agreed fights return to "agreed", ones in camp are cancelled.
  for (const id of ev.card) {
    const f = state.fights[id]
    if (!f || !['scheduled', 'training', 'fightNight'].includes(f.status)) continue
    if (f.status === 'scheduled' && fightInvolvesPlayer(state, f) && f.kind === 'player') { fightTransition(f, 'agreed'); f.eventId = undefined; f.day = 0 }
    else cancelFight(state, f, `${ev.name} was cancelled`)
  }
  ev.card = []
  if (mine) postMessage(state, { from: 'Events', category: 'world', priority: 'important', subject: `${ev.name} cancelled`, body: `${ev.name} will not go ahead: ${reason}. Ticket-holders were refunded${refund > 0 ? ` and £${refund.toLocaleString('en-GB')} of the venue fee came back` : ''}.`, link: { kind: 'event', id: ev.id } })
  else postNews(state, { headline: `${state.promotions[ev.promotionId].name} cancel ${ev.name}`, category: 'event', eventId: ev.id, importance: 25 })
}

export function cancelEventCommand(input: GameState, eventId: Id): EvResult {
  const ev0 = input.events[eventId]
  if (!ev0 || !['planning', 'venueBooked', 'cardBuilding', 'onSale', 'promoting', 'fightWeek'].includes(ev0.status)) return bad(input, 'This event cannot be cancelled.')
  const state = structuredClone(input)
  cancelEvent(state, state.events[eventId], 'cancelled by the promoter')
  return { ok: true, state, eventId }
}

// ------------------------------------------------------------------- Archiving

function maybeArchive(state: GameState, ev: BoxingEvent): void {
  if (ev.status === 'settled' && ev.result && state.today - ev.result.settledDay >= E.archiveAfterWeeks * 7) {
    eventTransition(ev, 'archived')
    ev.sales.history = []
    ev.sponsor.offers = ev.sponsor.accepted ? [ev.sponsor.accepted] : []
  }
}

/** Keep the history compact: old rival events shrink to a summary, then disappear. */
export function pruneEvents(state: GameState): void {
  for (const [id, ev] of Object.entries(state.events)) {
    const mine = ev.promotionId === state.playerPromotionId
    const age = state.today - ev.day
    if (ev.status === 'cancelled' && age > 365 && !mine) delete state.events[id]
    else if (!mine && ev.status === 'archived' && age > 5 * 365) delete state.events[id]
    else if (!mine && ev.status === 'archived' && age > 2 * 365 && ev.card.length > 1) ev.card = ev.card.slice(-1)
  }
  const cancelled = Object.values(state.events).filter((e) => e.status === 'cancelled' && e.promotionId === state.playerPromotionId)
  if (cancelled.length > E.maxCancelledKept) for (const e of cancelled.sort((a, b) => a.day - b.day).slice(0, cancelled.length - E.maxCancelledKept)) delete state.events[e.id]
}

// ------------------------------------------------------------- Quick card (Phase 3 compatibility)

/** Phase 3 API: schedule an agreed fight on its own. It now runs as a small one-fight show so the economics stay real. */
export function scheduleFightQuick(input: GameState, fightId: Id, day: number): EvResult {
  const f0 = input.fights[fightId]
  if (!f0 || f0.status !== 'agreed') return bad(input, 'This fight is not ready to be scheduled.')
  const org = f0.organiserId
  const a = input.fighters[f0.sideA.fighterId], b = input.fighters[f0.sideB.fighterId]
  const cand = Object.values(input.venues).filter((v) => v.tier === 'local' || v.tier === 'regional').filter((v) => !venueBookedOn(input, v.id, day))
  const home = input.promotions[org]?.homeCountry
  cand.sort((x, y) => Number(y.country === home) - Number(x.country === home) || x.hireCost - y.hireCost)
  const v = cand[0]
  if (!v) return bad(input, 'No venue is free on that date.')
  if (weeksBetween(input.today, day) < B.fights.minNoticeWeeks) return bad(input, 'Not enough notice.')
  const state = structuredClone(input)
  const ev = createEventInternal(state, org, { name: `Fight Night: ${a.lastName} vs ${b.lastName}`, day, venueId: v.id }, org === state.playerPromotionId ? 'player' : 'ai')
  const err = eventAcceptsFight(state, ev, state.fights[fightId])
  if (err) return bad(input, err)
  attachFight(state, ev, state.fights[fightId])
  startSales(state, ev)
  void weightClassLabel
  return { ok: true, state, eventId: ev.id }
}

export { OPEN_EVENT, cardFights }
export type { Venue }
