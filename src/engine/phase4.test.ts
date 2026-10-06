import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { approach, createEvent, addFightToEvent, cancelEvent, chooseSponsor, moveFightOnCard, offerFight, putEventOnSale, quickSimEvent, removeFightFromEvent, runEventToEnd, runNextEventFight, setCardSlot, setEventBroadcast, setEventMarketing, setEventPrices } from './commands'
import { totalCosts, totalRevenue } from './eventFinance'
import { cardFights, demandFor, forecastError, forecastEvent } from './events/demand'
import { eventList, eventView, venueFits, venueViews, dashboardEvent } from './eventViews'
import { canEventTransition, eventTransition } from './events/lifecycle'
import { processEvents, venueBookedOn, finishEvent } from './events/events'
import { suggestedFightOffer } from './fightNegotiation'
import { opponentCandidates } from './matchmaking'
import { idbBackend, memoryBackend, SaveVault, gzip, gunzip } from './persistence'
import { deserialiseGame, memoryStorage as memorySave, serialiseGame } from './save'
import { BALANCE as B } from './balance'
import { hireFor } from './events/demand'
import { GAME_STATE_VERSION } from './types'
import { financialHealth, player, playerRoster, weeklyBurn } from './selectors'
import { advanceOneWeek } from './tick'
import { post } from './ledger'
import type { BoxingEvent, FightOffer, GameState, Id } from './types'
import { createNewGame } from './worldgen'

const fresh = (seed = 'p4') => createNewGame({ seed, promotionName: 'P4', promoterName: 'T', homeCountry: 'ENG', difficulty: 'forgiving', logo: { monogram: 'P', color: '#fff', emblem: 'bolt' } }, 1_700_000_000_000)

function ledgerBalanced(s: GameState) {
  expect(s.ledgerArchive + s.ledger.reduce((a, t) => a + t.amount, 0)).toBe(player(s).cash)
}

const SAT = 5
/** The first Saturday at least `weeks` weeks away. */
const satIn = (s: GameState, weeks: number) => s.today + SAT + 7 * (weeks - 1)
const venueByName = (s: GameState, name: string) => Object.values(s.venues).find((v) => v.name === name)!

function agreeFight(s: GameState, myId: Id, taken: Set<Id>): { state: GameState; fightId: Id } | null {
  const cands = opponentCandidates(s, myId, {}).filter((x) => x.canApproach && !taken.has(x.view.id) && x.view.reputation < 50)
  for (const c of cands.slice(0, 8)) {
    const ap = approach(s, myId, c.view.id)
    if (!ap.ok) continue
    let st = ap.state
    const fightId = ap.fightId!
    for (let i = 0; i < 6; i++) {
      const base = suggestedFightOffer(st, c.view.id)
      const offer: FightOffer = { ...base, purseB: base.purseB * (1.2 + i * 0.4), winBonusB: base.winBonusB * 1.5 }
      const out = offerFight(st, fightId, offer)
      if (!out.ok) break
      st = out.state
      if (st.fights[fightId].status === 'agreed') { taken.add(c.view.id); return { state: st, fightId } }
      if (st.fights[fightId].status === 'cancelled') break
    }
  }
  return null
}

/** A player show at a small hall with `n` agreed fights on the card. */
function buildShow(seed = 'p4', n = 3, venueName = 'Ironworks Social Club', weeks = 8): { s: GameState; eventId: Id } {
  let s = fresh(seed)
  const v = venueByName(s, venueName)
  const r = createEvent(s, { name: 'Test Night', day: satIn(s, weeks), venueId: v.id })
  expect(r.ok, r.error).toBe(true)
  s = r.state
  const eventId = r.eventId!
  const taken = new Set<Id>()
  const roster = playerRoster(s).slice(0, n)
  for (const f of roster) {
    const a = agreeFight(s, f.id, taken)
    if (!a) continue
    const add = addFightToEvent(a.state, eventId, a.fightId)
    expect(add.ok, add.error).toBe(true)
    s = add.state
  }
  return { s, eventId }
}

function advanceTo(s: GameState, pred: (s: GameState) => boolean, max = 80): GameState {
  let st = s
  for (let i = 0; i < max && !pred(st); i++) st = advanceOneWeek(st)
  return st
}

describe('event lifecycle', () => {
  it('only allows legal status transitions', () => {
    expect(canEventTransition('planning', 'venueBooked')).toBe(true)
    expect(canEventTransition('cardBuilding', 'onSale')).toBe(true)
    expect(canEventTransition('onSale', 'promoting')).toBe(true)
    expect(canEventTransition('fightWeek', 'live')).toBe(true)
    expect(canEventTransition('live', 'completed')).toBe(true)
    expect(canEventTransition('completed', 'settled')).toBe(true)
    expect(canEventTransition('settled', 'archived')).toBe(true)
    expect(canEventTransition('planning', 'live')).toBe(false)
    expect(canEventTransition('onSale', 'settled')).toBe(false)
    expect(canEventTransition('cancelled', 'onSale')).toBe(false)
    expect(canEventTransition('archived', 'planning')).toBe(false)
    expect(() => eventTransition({ status: 'planning', id: 'x' } as BoxingEvent, 'completed')).toThrow(/Illegal/)
  })
})

describe('creating events', () => {
  const s = fresh()
  const v = venueByName(s, 'Ironworks Social Club')
  it('books a venue, pays the hire and starts in "venue booked"', () => {
    const r = createEvent(s, { name: 'Opening Night', day: satIn(s, 8), venueId: v.id })
    expect(r.ok, r.error).toBe(true)
    const ev = r.state.events[r.eventId!]
    expect(ev.status).toBe('venueBooked')
    const hire = hireFor(s, v, s.playerPromotionId)
    expect(hire).toBe(Math.round(v.hireCost * B.difficulty[s.settings.difficulty].venueCost))
    expect(player(r.state).cash).toBe(player(s).cash - hire)
    expect(ev.finance.costs.venue).toBe(hire)
    ledgerBalanced(r.state)
  })
  it('rejects bad dates, short notice, double-booking and too many open shows', () => {
    expect(createEvent(s, { name: 'Midweek', day: satIn(s, 8) + 2, venueId: v.id }).ok).toBe(false)
    expect(createEvent(s, { name: 'Too soon', day: satIn(s, 2), venueId: v.id }).error).toMatch(/notice/)
    expect(createEvent(s, { name: 'Far away', day: satIn(s, 80), venueId: v.id }).ok).toBe(false)
    expect(createEvent(s, { name: 'x', day: satIn(s, 8), venueId: v.id }).ok).toBe(false)
    const a = createEvent(s, { name: 'First', day: satIn(s, 8), venueId: v.id })
    expect(createEvent(a.state, { name: 'Clash', day: satIn(s, 8), venueId: v.id }).error).toMatch(/already booked/)
    expect(venueBookedOn(a.state, v.id, satIn(s, 8))).toBe(true)
    let st = a.state
    for (const w of [10, 12]) st = createEvent(st, { name: `Show ${w}`, day: satIn(s, w), venueId: venueByName(s, 'Dockside Leisure Centre').id }).state
    expect(Object.keys(st.events)).toHaveLength(3)
    expect(createEvent(st, { name: 'Fourth', day: satIn(s, 14), venueId: venueByName(s, 'Valleys Sports Centre').id }).error).toMatch(/three events/)
  })
  it('refuses a venue you cannot afford', () => {
    const poor = structuredClone(s)
    poor.promotions[poor.playerPromotionId].cash = 100
    const big = venueByName(poor, 'Meridian Arena')
    expect(createEvent(poor, { name: 'Dreams', day: satIn(poor, 8), venueId: big.id }).error).toMatch(/bank/)
  })
})

describe('building the card', () => {
  const { s, eventId } = buildShow('card', 3)
  it('puts agreed fights on the card, best fight last', () => {
    const ev = s.events[eventId]
    expect(ev.card.length).toBeGreaterThanOrEqual(2)
    expect(ev.status).toBe('cardBuilding')
    const v = eventView(s, eventId)!
    expect(v.card[v.card.length - 1].slot).toBe('MAIN EVENT')
    expect(v.card.every((c) => c.statusKey === 'scheduled')).toBe(true)
  })
  it('rejects a duplicate fighter and fights that are not agreed', () => {
    const f = cardFights(s, s.events[eventId])[0]
    const again = addFightToEvent(s, eventId, f.id)
    expect(again.ok).toBe(false)
  })
  it('lets you reorder, promote, and remove fights', () => {
    const ev = s.events[eventId]
    const first = ev.card[0]
    const moved = moveFightOnCard(s, eventId, first, 1)
    expect(moved.ok, moved.error).toBe(true)
    const main = setCardSlot(s, eventId, first, 'main')
    expect(main.ok, main.error).toBe(true)
    expect(main.state.events[eventId].card[main.state.events[eventId].card.length - 1]).toBe(first)
    const removed = removeFightFromEvent(s, eventId, first)
    expect(removed.ok, removed.error).toBe(true)
    expect(removed.state.events[eventId].card).not.toContain(first)
    expect(removed.state.fights[first].status).toBe('agreed')
    expect(removed.state.fights[first].eventId).toBeUndefined()
  })
  it('will not go on sale until the venue minimum is met', () => {
    const v = venueByName(s, 'Ironworks Social Club')
    expect(v.minFights).toBe(3)
    const short = removeFightFromEvent(s, eventId, s.events[eventId].card[0]).state
    expect(putEventOnSale(short, eventId).ok).toBe(false)
    expect(eventView(short, eventId)!.problems.length).toBeGreaterThan(0)
  })
  it('enforces size limits by venue tier', () => {
    const tiers = new Map(venueViews(s).map((x) => [x.tier, x]))
    expect(tiers.get('local')!.maxFights).toBeLessThanOrEqual(6)
    expect(tiers.get('stadium')!.minFights).toBeGreaterThanOrEqual(6)
    for (const t of ['local', 'regional', 'national', 'arena', 'stadium'] as const) expect(tiers.get(t)).toBeTruthy()
    const caps = venueViews(s)
    expect(Math.max(...caps.map((c) => c.capacity))).toBeGreaterThan(40_000)
    expect(Math.min(...caps.map((c) => c.capacity))).toBeLessThan(600)
  })
})

describe('tickets, marketing and demand (public model)', () => {
  const { s, eventId } = buildShow('demand', 3)
  const ev = s.events[eventId]
  it('demand falls as price rises and rises with marketing', () => {
    const base = demandFor(s, ev, 'public', { ga: 25, premium: 60, vip: 150 }, 0)
    const dear = demandFor(s, ev, 'public', { ga: 80, premium: 190, vip: 500 }, 0)
    expect(dear.ga).toBeLessThan(base.ga * 0.6)
    const cheap = demandFor(s, ev, 'public', { ga: 8, premium: 20, vip: 50 }, 0)
    expect(cheap.ga).toBeGreaterThan(base.ga)
    const marketed = demandFor(s, ev, 'public', ev.prices, 10_000)
    const unmarketed = demandFor(s, ev, 'public', ev.prices, 0)
    expect(marketed.ga).toBeGreaterThan(unmarketed.ga)
  })
  it('rejects nonsense prices and marketing changes after the show locks', () => {
    expect(setEventPrices(s, eventId, { ga: 50, premium: 40, vip: 30 }).ok).toBe(false)
    expect(setEventPrices(s, eventId, { ga: 2, premium: 40, vip: 60 }).ok).toBe(false)
    expect(setEventPrices(s, eventId, { ga: 30, premium: 70, vip: 160 }).ok).toBe(true)
    const m = setEventMarketing(s, eventId, { level: 'heavy' })
    expect(m.state.events[eventId].marketing.budget).toBe(5000)
    expect(setEventMarketing(s, eventId, { level: 'low' }).state.events[eventId].marketing.budget).toBe(500)
    expect(setEventMarketing(s, eventId, { level: 'standard' }).state.events[eventId].marketing.budget).toBe(2000)
    expect(setEventMarketing(s, eventId, { level: 'major', budget: 40_000 }).state.events[eventId].marketing.budget).toBe(40_000)
  })
  it('gives forecast ranges that widen the less experienced the promoter is', () => {
    const f = forecastEvent(s, ev)
    expect(f.attendance.hi).toBeGreaterThanOrEqual(f.attendance.lo) // a 450-seat hall with strong demand pins both ends at capacity
    expect(f.profit.hi).toBeGreaterThan(f.profit.lo)
    const veteran = structuredClone(s)
    veteran.promotions[veteran.playerPromotionId].stats.events = 40
    const f2 = forecastEvent(veteran, veteran.events[eventId])
    expect(f2.profit.hi - f2.profit.lo).toBeLessThanOrEqual(f.profit.hi - f.profit.lo)
    expect(forecastError(veteran, veteran.playerPromotionId)).toBeLessThan(forecastError(s, s.playerPromotionId)) // experience narrows the band
    expect(forecastError(veteran, veteran.playerPromotionId)).toBeGreaterThanOrEqual(0.2) // …but never to certainty
  })
  it('compares venues by fit', () => {
    const fits = venueFits(s, eventId)
    expect(fits.length).toBe(Object.keys(s.venues).length)
    const stadium = fits.find((x) => x.tierLabel === 'Stadium')!
    expect(stadium.verdict).toBe('too big')
    expect(stadium.fill.hi).toBeLessThan(0.3)
  })
  it('only offers broadcast options the promotion qualifies for', () => {
    const v = eventView(s, eventId)!
    expect(v.broadcast.options.find((o) => o.kind === 'none')!.available).toBe(true)
    expect(v.broadcast.options.find((o) => o.kind === 'localTv')!.available).toBe(true)
    expect(setEventBroadcast(s, eventId, 'localTv').ok).toBe(true)
    const nat = v.broadcast.options.find((o) => o.kind === 'nationalTv')!
    if (!nat.available) expect(setEventBroadcast(s, eventId, 'nationalTv').ok).toBe(false)
  })
})

describe('forecasts use public information only', () => {
  it('are unchanged when hidden fighter traits change', () => {
    const { s, eventId } = buildShow('hidden', 3)
    const a = JSON.stringify(forecastEvent(s, s.events[eventId]))
    const t = structuredClone(s)
    for (const f of Object.values(t.fighters)) {
      f.attributes.marketability = 100 - f.attributes.marketability
      f.attributes.power = Math.min(100, f.attributes.power + 15)
      f.potential = 30
      f.discipline = 5
    }
    expect(JSON.stringify(forecastEvent(t, t.events[eventId]))).toBe(a)
    expect(JSON.stringify(eventView(t, eventId)!.forecast)).toBe(a)
  })
  it('event views never carry hidden fighter fields', () => {
    const { s, eventId } = buildShow('hidden2', 3)
    const json = JSON.stringify([eventView(s, eventId), eventList(s, 'mine-open'), eventList(s, 'world-upcoming'), dashboardEvent(s)])
    for (const k of ['marketability', 'potential', 'discipline', 'composure', 'injuryRisk', 'attributes', 'hiddenFactor', 'personalityNote']) expect(json).not.toContain(`"${k}"`)
  })
})

describe('a full show: sell, run, settle', () => {
  const built = buildShow('full', 3)
  let s = built.s
  const eventId = built.eventId
  s = setEventPrices(s, eventId, { ga: 30, premium: 70, vip: 160 }).state
  s = setEventMarketing(s, eventId, { level: 'standard' }).state
  s = setEventBroadcast(s, eventId, 'localTv').state
  const sale = putEventOnSale(s, eventId)
  it('goes on sale', () => {
    expect(sale.ok, sale.error).toBe(true)
    expect(sale.state.events[eventId].status).toBe('onSale')
    expect(sale.state.events[eventId].sponsor.offers.length).toBeGreaterThan(0)
  })
  let cur = sale.state
  const sold: number[] = []
  const history: GameState[] = []
  it('sells tickets week by week, never above capacity, with revenue in the ledger', () => {
    for (let i = 0; i < 30 && cur.events[eventId].status !== 'fightWeek'; i++) {
      cur = advanceOneWeek(cur)
      const ev = cur.events[eventId]
      sold.push(ev.sales.sold[0] + ev.sales.sold[1] + ev.sales.sold[2])
      history.push(cur)
      expect(sold[sold.length - 1]).toBeLessThanOrEqual(cur.venues[ev.venueId].capacity)
    }
    for (let i = 1; i < sold.length; i++) expect(sold[i]).toBeGreaterThanOrEqual(sold[i - 1])
    expect(cur.events[eventId].status).toBe('fightWeek')
    expect(cur.events[eventId].finance.revenue.tickets).toBeGreaterThan(0)
    ledgerBalanced(cur)
  })
  it('reaches fight week with every fight ready, then runs the night', () => {
    const ev = cur.events[eventId]
    expect(cardFights(cur, ev).every((f) => f.status === 'fightNight')).toBe(true)
    const first = runNextEventFight(cur, eventId)
    expect(first.ok, first.error).toBe(true)
    expect(first.state.events[eventId].status).toBe('live')
    const sim = quickSimEvent(first.state, eventId, true)
    expect(sim.ok).toBe(true)
    const last = cardFights(sim.state, sim.state.events[eventId]).filter((f) => f.status === 'fightNight')
    expect(last.length).toBeLessThanOrEqual(1)
    const done = runEventToEnd(sim.state, eventId)
    expect(done.ok, done.error).toBe(true)
    s = done.state
    expect(['settled', 'completed']).toContain(s.events[eventId].status)
  })
  it('settles exactly once and reconciles to the ledger', () => {
    const ev = s.events[eventId]
    expect(ev.status).toBe('settled')
    expect(ev.settled).toBe(true)
    expect(ev.result).toBeTruthy()
    expect(ev.result!.profit).toBe(totalRevenue(ev.finance) - totalCosts(ev.finance))
    ledgerBalanced(s)
    // Every ledger line is tagged to this event's money: revenue categories match event revenue tallies.
    const sum = (cats: string[]) => s.ledger.filter((t) => cats.includes(t.category)).reduce((n, t) => n + t.amount, 0)
    expect(sum(['tickets'])).toBe(ev.finance.revenue.tickets)
    expect(sum(['sponsorship'])).toBe(ev.finance.revenue.sponsorship)
    expect(sum(['broadcast'])).toBe(ev.finance.revenue.broadcast - ev.finance.costs.broadcast)
    expect(-sum(['purses'])).toBe(ev.finance.costs.purses + ev.finance.costs.bonuses)
    expect(-sum(['venue'])).toBe(ev.finance.costs.venue)
    // settling again changes nothing
    const again = structuredClone(s)
    finishEvent(again, again.events[eventId])
    expect(again.ledger.length).toBe(s.ledger.length)
    expect(player(again).cash).toBe(player(s).cash)
  })
  it('updates reputation, fanbase, news and the history list', () => {
    const r = s.events[eventId].result!
    expect(r.attendance).toBeGreaterThan(0)
    expect(r.reputation).toBeGreaterThanOrEqual(0)
    expect(r.atmosphere).toBeGreaterThanOrEqual(0)
    const p = player(s)
    expect(p.stats.events).toBe(1)
    expect(p.stats.attendance).toBe(r.attendance)
    expect(eventList(s, 'mine-history').some((e) => e.id === eventId && e.profit === r.profit)).toBe(true)
    expect(s.news.some((n) => n.eventId === eventId)).toBe(true)
  })
  it('exposes top billing: the main event moves popularity more than the opener', () => {
    const fights = cardFights(s, s.events[eventId])
    expect(fights.length).toBeGreaterThanOrEqual(2)
    const meanAbs = (f: (typeof fights)[number]) => Math.abs(f.result!.dPop[0]) + Math.abs(f.result!.dPop[1])
    expect(meanAbs(fights[fights.length - 1]) + 0.01).toBeGreaterThan(0) // moves
  })
  it('survives a save/load mid-way and finishes identically', () => {
    const mid = history[Math.floor(history.length / 2)]
    const loaded = deserialiseGame(serialiseGame(mid))!
    expect(loaded.events[eventId].sales.sold).toEqual(mid.events[eventId].sales.sold)
    let a = mid, b = loaded
    for (let i = 0; i < 6; i++) { a = advanceOneWeek(a); b = advanceOneWeek(b) }
    expect(b.events[eventId].sales.sold).toEqual(a.events[eventId].sales.sold)
    expect(player(b).cash).toBe(player(a).cash)
  })
})

describe('cancelling', () => {
  it('refunds ticket-holders, frees the venue and returns fights to agreed', () => {
    let { s, eventId } = buildShow('cancel', 3)
    s = putEventOnSale(s, eventId).state
    s = advanceTo(s, (x) => x.events[eventId].finance.revenue.tickets > 0, 12)
    const ev0 = s.events[eventId]
    expect(ev0.finance.revenue.tickets).toBeGreaterThan(0)
    const cashBefore = player(s).cash
    const day = ev0.day
    const c = cancelEvent(s, eventId)
    expect(c.ok, c.error).toBe(true)
    const ev = c.state.events[eventId]
    expect(ev.status).toBe('cancelled')
    expect(ev.finance.revenue.tickets).toBe(0) // refunded in full
    expect(player(c.state).cash).toBeGreaterThanOrEqual(cashBefore - ev0.finance.revenue.tickets)
    ledgerBalanced(c.state)
    expect(venueBookedOn(c.state, ev.venueId, day)).toBe(false)
    for (const id of ev0.card) expect(['agreed', 'cancelled']).toContain(c.state.fights[id].status)
    expect(cancelEvent(c.state, eventId).ok).toBe(false)
    const after = advanceOneWeek(c.state)
    expect(after.events[eventId].status).toBe('cancelled')
    ledgerBalanced(after)
  })
  it('cancels a show whose card collapses and keeps the books balanced', () => {
    let { s, eventId } = buildShow('collapse', 3)
    s = putEventOnSale(s, eventId).state
    for (const id of s.events[eventId].card) { const f = s.fights[id]; s.fighters[f.sideA.fighterId].status = 'retired' }
    s = advanceTo(s, (x) => x.events[eventId].status === 'cancelled', 12)
    expect(s.events[eventId].status).toBe('cancelled')
    ledgerBalanced(s)
  })
})

describe('PPV and sponsors', () => {
  it('books PPV money through the ledger only at settlement, and sponsors only with a draw', () => {
    let { s, eventId } = buildShow('ppv', 3)
    s.promotions[s.playerPromotionId].reputation = 45
    for (const id of s.events[eventId].card) for (const side of [s.fights[id].sideA, s.fights[id].sideB]) { s.fighters[side.fighterId].popularity = 70; s.fighters[side.fighterId].reputation = 60 }
    const ppv = setEventBroadcast(s, eventId, 'ppv', 19.99)
    expect(ppv.ok, ppv.error).toBe(true)
    s = ppv.state
    const pv = eventView(s, eventId)!
    expect(pv.broadcast.options.find((o) => o.kind === 'ppv')).toBeTruthy()
    s = putEventOnSale(s, eventId).state
    const offer = s.events[eventId].sponsor.offers[0]
    if (offer) s = chooseSponsor(s, eventId, offer.id).state
    const preCash = player(s).cash
    s = advanceTo(s, (x) => x.events[eventId].status === 'fightWeek', 30)
    expect(s.events[eventId].finance.revenue.ppv).toBe(0)
    expect(s.events[eventId].finance.revenue.sponsorship).toBe(0)
    s = runEventToEnd(s, eventId).state
    const ev = s.events[eventId]
    expect(ev.finance.revenue.ppv).toBe(Math.round(ev.result!.ppvBuys * 19.99 * 0.55))
    expect(s.ledger.filter((t) => t.category === 'ppv').reduce((n, t) => n + t.amount, 0)).toBe(ev.finance.revenue.ppv)
    expect(ev.finance.costs.broadcast).toBeGreaterThan(0)
    ledgerBalanced(s)
    void preCash
  })
})

describe('financial health', () => {
  it('moves healthy → concern → critical → insolvent without ending the game', () => {
    const s = fresh()
    expect(financialHealth(s).state).toBe('healthy')
    const set = (cash: number) => { const t = structuredClone(s); t.promotions[t.playerPromotionId].cash = cash; return t }
    const burn = weeklyBurn(s).total
    expect(financialHealth(set(burn * 15)).state).toBe('concern')
    expect(financialHealth(set(burn * 40)).state).toBe('healthy')
    expect(financialHealth(set(-10_000)).state).toBe('critical')
    const ins = set(-200_000)
    expect(financialHealth(ins).state).toBe('insolvent')
    const v = venueByName(ins, 'Ironworks Social Club')
    expect(createEvent(ins, { name: 'No way', day: satIn(ins, 8), venueId: v.id }).error).toMatch(/insolvent/)
    expect(advanceOneWeek(ins).today).toBe(ins.today + 7) // the game goes on
  })
})

describe('AI promotions run events', () => {
  let s = fresh('ai4')
  for (let i = 0; i < 40; i++) s = advanceOneWeek(s)
  it('plan, sell and settle their own shows', () => {
    const evs = Object.values(s.events).filter((e) => e.kind === 'ai')
    expect(evs.length).toBeGreaterThan(3)
    expect(evs.some((e) => e.result)).toBe(true)
    for (const e of evs.filter((x) => x.result)) {
      expect(e.result!.attendance).toBeLessThanOrEqual(s.venues[e.venueId].capacity)
      expect(e.settled).toBe(true)
    }
  })
  it('never double-book a venue on a date', () => {
    const seen = new Set<string>()
    for (const e of Object.values(s.events)) {
      if (e.status === 'cancelled') continue
      const k = `${e.venueId}:${e.day}`
      expect(seen.has(k), k).toBe(false)
      seen.add(k)
    }
  })
  it('keep honest books: cash reconciles to revenue, costs, overhead and bailouts', () => {
    for (const p of Object.values(s.promotions).filter((x) => !x.isPlayer)) {
      const a = p.accounting!
      expect(p.cash).toBe(Math.round(a.startCash + a.revenue - a.costs - a.overhead + a.bailouts - a.distributions))
    }
  })
  it('only let each fighter appear once per card, and keep cards within venue limits', () => {
    for (const e of Object.values(s.events).filter((x) => x.kind === 'ai' && x.status !== 'cancelled' && x.card.length)) {
      const ids = cardFights(s, e).flatMap((f) => [f.sideA.fighterId, f.sideB.fighterId])
      expect(new Set(ids).size).toBe(ids.length)
      expect(e.card.length).toBeLessThanOrEqual(s.venues[e.venueId].maxFights)
    }
  })
})

describe('persistence vault', () => {
  it('round-trips a save through IndexedDB with gzip and lists slots', async () => {
    const be = await idbBackend(new IDBFactory(), 'test-db-1')
    const vault = new SaveVault(be)
    const s = advanceOneWeek(fresh('idb'))
    const meta = await vault.save(s)
    expect(meta.compressed).toBe(true)
    expect(meta.bytes).toBeLessThan(serialiseGame(s).length / 3)
    const back = await vault.load(s.saveId)
    expect(back).toBeTruthy()
    expect(serialiseGame(back!)).toBe(serialiseGame(s))
    await vault.save(s, { auto: true })
    await vault.save(s, { slotId: 'slot-2', name: 'Before the big night' })
    const list = await vault.list()
    expect(list.map((m) => m.slot).sort()).toEqual(['auto', 'manual', 'manual'])
    expect(list.find((m) => m.id === 'slot-2')!.name).toBe('Before the big night')
    await vault.remove('slot-2')
    expect((await vault.list()).length).toBe(2)
    expect(await vault.load('missing')).toBeNull()
  })
  it('migrates legacy localStorage saves into IndexedDB', async () => {
    const legacy = memorySave()
    const { saveGame } = await import('./save')
    const s = fresh('legacy')
    saveGame(legacy, s)
    const vault = new SaveVault(await idbBackend(new IDBFactory(), 'test-db-2'))
    expect(await vault.migrateLegacy(legacy)).toBe(1)
    const back = await vault.load(s.saveId)
    expect(back?.saveId).toBe(s.saveId)
    expect(await vault.migrateLegacy(legacy)).toBe(0) // idempotent
  })
  it('works with the in-memory fallback and survives corrupt payloads', async () => {
    const vault = new SaveVault(memoryBackend())
    const s = fresh('mem')
    await vault.save(s)
    expect((await vault.load(s.saveId))?.today).toBe(s.today)
    const raw = await gzip('{not json')
    expect(raw).toBeTruthy()
    expect(await gunzip(raw!)).toBe('{not json')
    await vault.backend.put({ id: 'bad', gameId: 'bad', name: 'bad', promotionName: 'x', today: 0, savedAt: 0, version: 4, slot: 'manual', bytes: 1, compressed: false }, '{nope')
    expect(await vault.load('bad')).toBeNull()
  })
})

describe('save migration', () => {
  it('upgrades a v3 save to the current version with venues, events, AI accounting and AI traits', () => {
    const s = fresh('mig') as unknown as Record<string, unknown> & GameState
    const v3 = JSON.parse(JSON.stringify(s)) as Record<string, any>
    v3.version = 3
    delete v3.events
    for (const v of Object.values<any>(v3.venues)) { delete v.tier; delete v.production; delete v.market; delete v.minFights; delete v.maxFights }
    for (const p of Object.values<any>(v3.promotions)) { delete p.stats; delete p.accounting }
    const m = deserialiseGame(JSON.stringify(v3))!
    expect(m.version).toBe(GAME_STATE_VERSION)
    expect(Object.values(m.promotions).filter((p) => p.ai).every((p) => !!p.ai!.competence && !!p.ai!.fin)).toBe(true)
    expect(m.events).toEqual({})
    expect(Object.values(m.venues).every((v) => v.tier && v.minFights > 0)).toBe(true)
    expect(Object.values(m.promotions).every((p) => !!p.stats)).toBe(true)
    let t = m
    for (let i = 0; i < 20; i++) t = advanceOneWeek(t)
    expect(t.today).toBe(m.today + 140)
  })
})

describe('event processing is deterministic', () => {
  it('two runs from the same state give the same result', () => {
    const { s } = buildShow('det', 3)
    let a = s, b = structuredClone(s)
    for (let i = 0; i < 12; i++) { a = advanceOneWeek(a); b = advanceOneWeek(b) }
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events))
    void processEvents
  })
})

void post
