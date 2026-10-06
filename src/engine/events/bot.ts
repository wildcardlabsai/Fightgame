/**
 * A scripted "reasonable promoter" used by the balance tests. It plays through the same public commands the UI uses:
 * agree fights, pick a venue from the public forecast, price and promote sensibly, run the night. It is not clever —
 * it exists to show whether an ordinary player can make the economy work.
 */
import { addFightToEvent, approach, makeOffer, chooseSponsor, createEvent, offerFight, putEventOnSale, runEventToEnd, setEventBroadcast, setEventMarketing, setEventPrices } from '../commands'
import { suggestedFightOffer } from '../fightNegotiation'
import { opponentCandidates } from '../matchmaking'
import { suggestedOffer } from '../negotiation'
import { viewsOf } from '../view'
import { playerRoster } from '../selectors'
import type { FightOffer, GameState, Id, MarketingLevel, Venue } from '../types'
import { draftEvent } from './ai'
import { broadcastTerms, demandFor, eventInterest, forecastEvent, refPrices, soldFromDemand } from './demand'
import { playerOpenEvents, venueBookedOn } from './events'

const TIERS = ['local', 'regional', 'national', 'arena', 'stadium']

function agreeOne(s: GameState, myId: Id, taken: Set<Id>, maxStretch: number): { state: GameState; fightId: Id } | null {
  const cands = opponentCandidates(s, myId, {}).filter((x) => x.canApproach && !taken.has(x.view.id)).sort((a, b) => a.view.reputation - b.view.reputation)
  for (const c of cands.slice(0, 6)) {
    const ap = approach(s, myId, c.view.id)
    if (!ap.ok) continue
    let st = ap.state
    const fightId = ap.fightId!
    for (let i = 0; i < 5; i++) {
      const base = suggestedFightOffer(st, c.view.id)
      const offer: FightOffer = { ...base, purseB: base.purseB * (1 + i * maxStretch), winBonusB: base.winBonusB }
      const out = offerFight(st, fightId, offer)
      if (!out.ok) break
      st = out.state
      const status = st.fights[fightId].status
      if (status === 'agreed') { taken.add(c.view.id); return { state: st, fightId } }
      if (status === 'cancelled') break
    }
  }
  return null
}

export interface ShowRecord { tier: string; venue: string; fights: number; fill: number; revenue: number; costs: number; profit: number; day: number; forecastMid: number; strategy: string }
export interface BotLog { shows: ShowRecord[]; planned: number; cancelled: number; noCard: number; noVenue: number }

export function newBotLog(): BotLog { return { shows: [], planned: 0, cancelled: 0, noCard: 0, noVenue: 0 } }

/** Keep the roster stocked and contracts renewed (so shows can be filled). */
function botRoster(input: GameState): GameState {
  let s = input
  const roster = playerRoster(s)
  const cash = s.promotions[s.playerPromotionId].cash
  // renewals
  for (const f of roster) {
    const c = s.contracts[f.contractId!]
    if (!c || c.endDay - s.today > 26 * 7 || f.reputation < 12) continue
    const base = suggestedOffer(s, f, 'renewal')
    for (const k of [1, 1.15, 1.35, 1.6]) {
      const out = makeOffer(s, f.id, { ...base, basePurse: base.basePurse * k, weeklyRetainer: base.weeklyRetainer * k, signingBonus: base.signingBonus * k }, 'renewal')
      if (!out.ok) break
      s = out.state
      if (s.fighters[f.id].contractId !== f.contractId) break
    }
  }
  if (roster.length < 6 && cash > 450_000 && Math.floor(s.today / 7) % 3 === 0) {
    const free = viewsOf(s).freeAgents().filter((v) => v.status === 'active' && v.age < 36).sort((a, b) => b.reputation + b.popularity - (a.reputation + a.popularity)).slice(0, 8)
    for (const v of free) {
      const f = s.fighters[v.id]
      const base = suggestedOffer(s, f, 'signing')
      let signed = false
      for (const k of [1, 1.2, 1.5]) {
        const out = makeOffer(s, f.id, { ...base, basePurse: base.basePurse * k, weeklyRetainer: base.weeklyRetainer * k, signingBonus: base.signingBonus * k }, 'signing')
        if (!out.ok) break
        s = out.state
        if (s.fighters[f.id].contractId) { signed = true; break }
      }
      if (signed) break
    }
  }
  return s
}

/** Management actions for one week. Returns the new state. */
export function botManage(input: GameState, log: BotLog, opts: { ambition?: number; greedy?: boolean } = {}): GameState {
  let s = botRoster(input)
  // Run any show that is ready.
  for (const ev of Object.values(s.events)) {
    if (ev.promotionId === s.playerPromotionId && (ev.status === 'fightWeek' || ev.status === 'live')) s = runEventToEnd(s, ev.id).state
  }
  // Record settled shows once.
  for (const ev of Object.values(s.events)) {
    if (ev.promotionId !== s.playerPromotionId || !ev.result || (ev as { _logged?: boolean })._logged) continue
    ;(ev as { _logged?: boolean })._logged = true
    const v = s.venues[ev.venueId]
    log.shows.push({ tier: v.tier, venue: v.name, fights: ev.card.length, fill: ev.result.attendance / v.capacity, revenue: ev.result.revenue, costs: ev.result.costs, profit: ev.result.profit, day: ev.day, forecastMid: 0, strategy: ev.marketing.strategy })
  }
  for (const ev of Object.values(s.events)) if (ev.promotionId === s.playerPromotionId && ev.status === 'cancelled' && !(ev as { _c?: boolean })._c) { (ev as { _c?: boolean })._c = true; log.cancelled++ }

  const open = playerOpenEvents(s)
  const cash = s.promotions[s.playerPromotionId].cash
  if (open.length >= (playerRoster(s).length >= 7 ? 2 : 1) || cash < 80_000) return s
  const roster = playerRoster(s).filter((f) => !f.activeFightId && !f.injury)
  if (roster.length < 3) return s

  // Agree fights first.
  const taken = new Set<Id>()
  const agreed: Id[] = []
  let st = s
  for (const f of roster.slice(0, 6)) {
    if (st.fighters[f.id].activeFightId) continue
    const a = agreeOne(st, f.id, taken, 0.35)
    if (a) { st = a.state; agreed.push(a.fightId) }
  }
  if (agreed.length < 3) { log.noCard++; return s }

  // Venue: best forecast profit among buildings that can take this card, free on the first Saturday ~9 weeks out.
  const day = st.today + 5 + 7 * 8
  const fights = agreed.map((id) => st.fights[id])
  let best: { v: Venue; mid: number } | null = null
  for (const v of Object.values(st.venues)) {
    if (v.minFights > agreed.length || v.hireCost > cash * 0.25 || venueBookedOn(st, v.id, day)) continue
    const ev = draftEvent(st, st.promotions[st.playerPromotionId], fights, v, day)
    ev.kind = 'player'
    ev.prices = refPrices(eventInterest(st, ev))
    ev.marketing = { level: 'standard', strategy: 'standard', budget: 2_000, spent: 0 }
    const f = forecastEvent(st, ev)
    const mid = opts.greedy ? v.capacity : (f.profit.lo + f.profit.hi) / 2 - (opts.ambition ?? 0)
    if (!best || mid > best.mid) best = { v, mid }
  }
  if (!best) { log.noVenue++; return s }
  const made = createEvent(st, { name: `Show ${log.planned + 1}`, day, venueId: best.v.id })
  if (!made.ok) { log.noVenue++; return s }
  st = made.state
  const eid = made.eventId!
  for (const id of agreed) st = addFightToEvent(st, eid, id).state
  log.planned++
  const ev = st.events[eid]
  st = setEventPrices(st, eid, refPrices(eventInterest(st, ev))).state
  const level: MarketingLevel = TIERS.indexOf(best.v.tier) >= 3 ? 'major' : TIERS.indexOf(best.v.tier) >= 2 ? 'heavy' : TIERS.indexOf(best.v.tier) >= 1 ? 'standard' : 'low'
  st = setEventMarketing(st, eid, { level }).state
  // Broadcast: best guaranteed net.
  let bk: 'none' | 'localTv' | 'nationalTv' | 'streaming' = 'none', bnet = 0
  for (const k of ['localTv', 'nationalTv', 'streaming'] as const) {
    const t = broadcastTerms(st, st.events[eid], k, 'public')
    if (t.available && t.fee - t.production > bnet) { bk = k; bnet = t.fee - t.production }
  }
  if (bk !== 'none') st = setEventBroadcast(st, eid, bk).state
  const put = putEventOnSale(st, eid)
  if (!put.ok) return s
  st = put.state
  const offers = st.events[eid].sponsor.offers.slice().sort((a, b) => b.fixedFee - a.fixedFee)
  if (offers[0]) st = chooseSponsor(st, eid, offers[0].id).state
  void demandFor; void soldFromDemand
  return st
}
