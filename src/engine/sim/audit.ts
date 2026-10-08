/**
 * SYNTHETIC SHOW AUDITS. Builds hypothetical cards (low / medium / high popularity, superstar) in a real world state and
 * draws many hidden outcomes (different seeds) so the economics of tickets, sponsors, broadcast and PPV can be inspected.
 */
import { fighterAge } from '../fighters'
import { createFight } from '../fights'
import { transition } from '../fight/lifecycle'
import { totalCosts } from '../eventFinance'
import { attachFight, createEventInternal, generateSponsorOffers } from '../events/events'
import {
  broadcastTerms, cardQuality, demandFor, eventInterest, forecastEvent, hireFor, officialsCost, ppvBuysFor, productionCost, refPrices, soldFromDemand, viewersFor,
} from '../events/demand'
import { BALANCE as B } from '../balance'
import { baseMoney, marketValue } from '../market'
import { publicFacts } from '../fighters'
import type { BoxingEvent, BroadcastKind, GameState, VenueTier } from '../types'
import { createNewGame } from '../worldgen'

export type Profile = 'low' | 'medium' | 'high' | 'superstar'
export const PROFILES: Record<Profile, { pop: number; rep: number; wins: number; under: number }> = {
  low: { pop: 20, rep: 22, wins: 8, under: 12 },
  medium: { pop: 45, rep: 45, wins: 18, under: 25 },
  high: { pop: 70, rep: 68, wins: 28, under: 35 },
  superstar: { pop: 86, rep: 82, wins: 36, under: 50 },
}

/** Synthetic cards price purses from the profile's fame and reputation (the audit's own assumption), independent of the live valuation engine. */
const legacyPurse = (state: GameState, f: GameState['fighters'][string]): number => baseMoney(marketValue(publicFacts(f, state.today), f.reputation)).purse

export interface Show { state: GameState; ev: BoxingEvent }

export function buildShow(opts: { profile: Profile; tier: VenueTier; promoRep?: number; nFights?: number; seed?: string; form?: 'normal' | 'hot' | 'cold'; popOverride?: number; repOverride?: number; marketing?: number }): Show {
  const state = createNewGame({ seed: opts.seed ?? 'audit', promotionName: 'Audit', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo: { monogram: 'A', color: '#fff', emblem: 'bolt' } })
  const P = PROFILES[opts.profile]
  const promo = state.promotions[state.playerPromotionId]
  promo.reputation = opts.promoRep ?? 40
  promo.fanbase = Math.round(1000 * Math.pow(promo.reputation, 1.9))
  promo.stats.events = 10
  const venue = Object.values(state.venues).filter((v) => v.tier === opts.tier && v.country === 'ENG').sort((a, b) => a.capacity - b.capacity).pop() ?? Object.values(state.venues).find((v) => v.tier === opts.tier)!
  const n = Math.max(venue.minFights, Math.min(venue.maxFights, opts.nFights ?? venue.minFights))
  // Fighters of one weight class so any pairing is legal; popularity set from the profile.
  const pool = Object.values(state.fighters).filter((f) => f.status === 'active' && !f.contractId && !f.injury && fighterAge(f, state.today) < 33)
  const byClass = new Map<string, typeof pool>()
  for (const f of pool) byClass.set(f.weightClass, [...(byClass.get(f.weightClass) ?? []), f])
  const group = [...byClass.values()].sort((a, b) => b.length - a.length)[0]
  const day = state.today + 5 + 7 * 10
  const ev = createEventInternal(state, promo.id, { name: 'Audit Night', day, venueId: venue.id }, 'player')
  for (let i = 0; i < n; i++) {
    const a = group[2 * i], b = group[2 * i + 1]
    const main = i === n - 1
    const co = i === n - 2
    for (const f of [a, b]) {
      f.popularity = opts.popOverride !== undefined && i === n - 1 ? opts.popOverride : main ? P.pop : co ? Math.round(0.7 * P.pop) : P.under
      f.reputation = opts.repOverride !== undefined && i === n - 1 ? opts.repOverride : main ? P.rep : co ? Math.round(0.7 * P.rep) : P.under
      f.record.wins = main || co ? P.wins : 6; f.record.losses = main || co ? 2 : 3; f.record.draws = 0
      f.momentum = opts.form === 'hot' ? 70 : opts.form === 'cold' ? -60 : 0
      f.status = 'active'
    }
    const fight = createFight(state, a.id, b.id, promo.id, 'player', { purseA: legacyPurse(state, a), purseB: legacyPurse(state, b), winBonusA: 0, winBonusB: 0 })
    transition(fight, 'agreed')
    attachFight(state, ev, fight)
  }
  const ref = refPrices(eventInterest(state, ev))
  ev.prices = ref
  const spend = opts.marketing ?? Math.round(0.08 * venue.capacity * ref.ga)
  ev.marketing = { level: 'standard', strategy: 'standard', budget: spend, spent: spend }
  return { state, ev }
}

export interface Draw { tickets: number; attendance: number; fill: number; ppvBuys: number; viewers: number }

/** Draw the hidden outcome many times (different world seeds). */
export function draws(show: Show, n: number, tune?: (ev: BoxingEvent) => void): Draw[] {
  const { state, ev } = show
  const base = state.seed
  tune?.(ev)
  const out: Draw[] = []
  for (let i = 0; i < n; i++) {
    state.seed = `${base}#${i}`
    const d = demandFor(state, ev, 'actual', ev.prices, ev.marketing.spent)
    const v = state.venues[ev.venueId]
    const sold = soldFromDemand(d, v)
    const att = sold[0] + sold[1] + sold[2]
    out.push({ tickets: sold[0] * ev.prices.ga + sold[1] * ev.prices.premium + sold[2] * ev.prices.vip, attendance: att, fill: att / v.capacity, ppvBuys: ev.broadcast.kind === 'ppv' ? ppvBuysFor(state, ev, 'actual') : 0, viewers: viewersFor(state, ev, 'actual') })
  }
  state.seed = base
  return out
}

export const quantile = (a: number[], p: number): number => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
export const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)

/** Fixed costs that do not depend on how many people come. */
export function fixedCosts(show: Show, kind: BroadcastKind): number {
  const { state, ev } = show
  const v = state.venues[ev.venueId]
  const purses = ev.card.reduce((n, id) => n + state.fights[id].terms.purseA + state.fights[id].terms.purseB, 0)
  return hireFor(state, v, ev.promotionId) + productionCost(v) + officialsCost(ev.card.length) + purses + ev.marketing.budget + broadcastTerms(state, ev, kind, 'public').production
}

/** Net profit of one draw under a broadcast choice (sponsors excluded). */
export function netFor(show: Show, kind: BroadcastKind, d: Draw): number {
  const { state, ev } = show
  const bt = broadcastTerms(state, ev, kind, 'actual')
  const ppvRev = kind === 'ppv' ? d.ppvBuys * ev.broadcast.ppvPrice * B.events.ppv.promoterShare : 0
  const bcast = kind === 'streaming' ? d.viewers * B.events.tv.streaming.perViewer : kind === 'localTv' || kind === 'nationalTv' ? bt.fee : 0
  const costs = fixedCosts(show, kind) + d.attendance * B.events.costs.securityPerHead + d.tickets * B.events.costs.sanctionShare
  return d.tickets + ppvRev + bcast - costs
}

export { cardQuality, forecastEvent, generateSponsorOffers, totalCosts }
