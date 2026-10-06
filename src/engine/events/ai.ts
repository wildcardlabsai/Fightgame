/**
 * AI EVENT PLANNING. Rival promotions promote shows, not loose fights: each plans a date, builds a card from its own
 * roster and the market, picks a venue its size and budget can fill, prices tickets, markets, sells and settles
 * through exactly the same event engine as the player. Strategy shapes the decisions:
 *   money           — higher prices, heavy marketing, PPV when the headliner is a draw
 *   prospectFactory — cheap tickets, small venues, local marketing
 *   traditional     — balanced
 *   regional        — home-region venues and local marketing
 */
import { BALANCE as B } from '../balance'
import { transition } from '../fight/lifecycle'
import { cancelFight, createFight } from '../fights'
import { keyedRng, type Rng } from '../rng'
import type { BoxingEvent, BroadcastKind, Fight, GameState, Id, MarketingLevel, Promotion, PromoStrategy, Venue, VenueTier } from '../types'
import { baseMoney, valueOf } from '../market'
import { bookable, pickOpponent, weeksSince } from '../systems/aiFights'
import { broadcastTerms, cardFights, cardQuality, demandFor, eventInterest, fightAppeal, ppvRefPrice, refPrices, soldFromDemand } from './demand'
import { attachFight, createEventInternal, startSales, venueBookedOn } from './events'
import { isEventOpen } from './lifecycle'

const E = B.events
const SAT = 5
const TIER_ORDER: VenueTier[] = ['local', 'regional', 'national', 'arena', 'stadium']
const MAX_TIER: Record<string, number> = { Startup: 1, Regional: 2, National: 3, Major: 4, Global: 4 }
const FIGHTS_RANGE: Record<string, [number, number]> = { Startup: [3, 5], Regional: [4, 7], National: [5, 8], Major: [7, 10], Global: [8, 10] }
const MAX_OPEN: Record<string, number> = { Startup: 1, Regional: 1, National: 2, Major: 2, Global: 3 }

export function aiEvents(state: GameState, rng: Rng): void {
  const promos = rng.shuffle(Object.values(state.promotions).filter((p) => !p.isPlayer && p.ai))
  const playerRoster = new Set(Object.values(state.contracts).filter((c) => c.promotionId === state.playerPromotionId).map((c) => c.fighterId))
  for (const promo of promos) {
    const open = Object.values(state.events).filter((e) => e.promotionId === promo.id && isEventOpen(e))
    if (open.length >= MAX_OPEN[promo.tier]) continue
    if (!rng.chance(1 / E.ai.cadenceWeeks[promo.tier])) continue
    planEvent(state, promo, rng, playerRoster)
  }
}

function planEvent(state: GameState, promo: Promotion, rng: Rng, playerRoster: Set<Id>): void {
  const [lo, hi] = E.ai.leadWeeks
  let day = state.today + SAT + 7 * rng.int(lo, hi)
  const [minN, maxN] = FIGHTS_RANGE[promo.tier]
  const target = rng.int(minN, maxN)
  const contracts = Object.values(state.contracts).filter((c) => c.promotionId === promo.id)
  const needy = contracts
    .map((c) => ({ c, f: state.fighters[c.fighterId] }))
    .filter((x) => x.f && bookable(state, x.f, day) && weeksSince(state, x.f) >= B.fights.restWeeks + 2)
    .sort((a, b) => weeksSince(state, b.f) - weeksSince(state, a.f))

  // Build the fights first (agreed, unscheduled); the venue follows from how good the card is.
  const fights: Fight[] = []
  let committed = 0
  for (const { c, f: x } of needy) {
    if (fights.length >= target) break
    if (x.activeFightId || !bookable(state, x, day)) continue
    const opp = pickOpponent(state, promo, x, day, playerRoster, rng)
    if (!opp) continue
    const ct = opp.contractId ? state.contracts[opp.contractId] : null
    const fa = baseMoney(valueOf(state, opp)).purse * B.fights.ai.journeymanPurseFactor
    const purseB = ct ? ct.basePurse : Math.round(fa / 100) * 100
    const winB = ct ? ct.winBonus : Math.round((purseB * 0.1) / 100) * 100
    const cost = c.basePurse + purseB + c.winBonus + winB
    if (promo.cash < (committed + cost) * 1.4) continue
    committed += cost
    const fight = createFight(state, x.id, opp.id, promo.id, 'ai', { purseB, winBonusB: winB })
    transition(fight, 'agreed')
    opp.activeFightId = fight.id
    for (const [side, f] of [[fight.sideA, x], [fight.sideB, opp]] as const) {
      side.prep.plan = ['Pressure Fighter', 'Swarmer', 'Power Puncher'].includes(f.style) ? 'aggressive' : ['Defensive Specialist', 'Counter Puncher'].includes(f.style) ? 'cautious' : 'balanced'
    }
    fights.push(fight)
  }
  const abort = () => { for (const f of fights) if (f.status === 'agreed') cancelFight(state, f, 'the show was never put together') }
  if (fights.length < 3) return abort()

  const venue = pickVenue(state, promo, fights, day, committed)
  if (!venue) return abort()
  // Never overload a venue; leftover fights fall away.
  while (fights.length > venue.maxFights) { const f = fights.pop()!; cancelFight(state, f, 'dropped from the card') }
  day = Math.max(day, state.today + SAT)

  const ev = createEventInternal(state, promo.id, { name: eventName(state, promo, venue), day, venueId: venue.id }, 'ai')
  for (const f of fights.sort((a, b) => fightAppeal(state, a) - fightAppeal(state, b))) attachFight(state, ev, f)
  configure(state, ev, promo, rng)
  startSales(state, ev)
  ev.sponsor.accepted = ev.sponsor.offers.slice().sort((a, b) => b.fixedFee - a.fixedFee).find((o) => cardQuality(state, ev).main >= 0 && o.minMainPopularity <= maxPop(state, ev) + 5) ?? null
}

function maxPop(state: GameState, ev: BoxingEvent): number {
  const main = cardFights(state, ev).slice(-1)[0]
  return main ? Math.max(state.fighters[main.sideA.fighterId].popularity, state.fighters[main.sideB.fighterId].popularity) : 0
}

function eventName(state: GameState, promo: Promotion, v: Venue): string {
  const n = Object.values(state.events).filter((e) => e.promotionId === promo.id).length + 1
  return `${promo.name} ${n}: ${v.city}`
}

/** A throwaway event used only to forecast demand for a venue before committing to it. */
export function draftEvent(state: GameState, promo: Promotion, fights: Fight[], v: Venue, day: number): BoxingEvent {
  return {
    id: 'draft', promotionId: promo.id, kind: 'ai', name: 'draft', day, venueId: v.id, city: v.city, country: v.country, status: 'cardBuilding',
    card: fights.slice().sort((a, b) => fightAppeal(state, a) - fightAppeal(state, b)).map((f) => f.id),
    prices: { ga: 0, premium: 0, vip: 0 }, marketing: { level: 'standard', strategy: 'standard', budget: 2_000, spent: 2_000 },
    broadcast: { kind: 'none', ppvPrice: 15 }, sponsor: { offers: [], accepted: null },
    sales: { sold: [0, 0, 0], weeksOnSale: 0, awareness: 0, momentum: 1, history: [] }, finance: { revenue: { tickets: 0, sponsorship: 0, broadcast: 0, ppv: 0 }, costs: { venue: 0, marketing: 0, production: 0, purses: 0, bonuses: 0, officials: 0, security: 0, broadcast: 0 } },
    settled: false, createdDay: state.today, onSaleDay: null, nextFight: 0, expectedAttendance: 0,
  }
}

/** The biggest building the card can honestly fill (≈80%), within the promotion's means and style. */
function pickVenue(state: GameState, promo: Promotion, fights: Fight[], day: number, committed: number): Venue | null {
  const strat = promo.ai!.strategy
  const cap = Math.min(MAX_TIER[promo.tier], strat === 'prospectFactory' ? 1 : 4)
  const n = fights.length
  const budget = Math.max(0, promo.cash - committed * 1.3) * 0.12
  const options = Object.values(state.venues)
    .filter((v) => TIER_ORDER.indexOf(v.tier) <= cap && v.minFights <= n && v.hireCost <= budget && !venueBookedOn(state, v.id, day))
  if (options.length === 0) return null
  // Promoters misjudge their own draw: each one forecasts with its own error and style-dependent ambition.
  const want = strat === 'money' ? 0.62 : strat === 'prospectFactory' ? 0.85 : 0.75
  const err = 1 + (keyedRng(state.seed, 'aiforecast', promo.id, day).next() - 0.45) * 0.9
  const scored = options.map((v) => {
    const ev = draftEvent(state, promo, fights, v, day)
    ev.prices = refPrices(eventInterest(state, ev))
    const d = demandFor(state, ev, 'public')
    const fill = (soldFromDemand(d, v).reduce((a, b) => a + b, 0) / v.capacity) * err
    return { v, fill, home: v.country === promo.homeCountry ? 1 : 0 }
  })
  const fits = scored.filter((x) => x.fill >= want)
  const pool = fits.length ? fits : scored.sort((a, b) => b.fill - a.fill).slice(0, 2)
  pool.sort((a, b) => b.v.capacity * (1 + 0.15 * b.home) - a.v.capacity * (1 + 0.15 * a.home))
  return pool[0].v
}

/** Prices, marketing, broadcast and sponsor the way this promotion's style would. */
function configure(state: GameState, ev: BoxingEvent, promo: Promotion, rng: Rng): void {
  const strat = promo.ai!.strategy
  const interest = eventInterest(state, ev)
  const ref = refPrices(interest)
  const mult = { money: 1.12, prospectFactory: 0.85, traditional: 1, regional: 0.92 }[strat]
  const jitter = 0.94 + keyedRng(state.seed, 'aiprice', ev.id).next() * 0.12
  const v0 = state.venues[ev.venueId]
  // Price to maximise the gate: raise prices until the building is just about full.
  let bestM = mult * jitter, bestRev = -1
  const cap = 0.85 + 0.55 * keyedRng(state.seed, 'aicap', ev.id).next()
  for (let m = 0.7; m <= cap; m += 0.05) {
    const f = m * mult * jitter
    const pr = { ga: Math.max(8, Math.round(ref.ga * f)), premium: Math.round(ref.premium * f), vip: Math.round(ref.vip * f) }
    const d = demandFor(state, ev, 'public', pr)
    const sold = soldFromDemand(d, v0)
    const rev = sold[0] * pr.ga + sold[1] * pr.premium + sold[2] * pr.vip
    if (rev > bestRev) { bestRev = rev; bestM = f }
  }
  ev.prices = { ga: Math.max(8, Math.round(ref.ga * bestM)), premium: Math.round(ref.premium * bestM), vip: Math.round(ref.vip * bestM) }
  const v = state.venues[ev.venueId]
  const share = E.ai.marketingShare[strat]
  const spendTarget = share * Math.max(8_000, v.capacity * ev.prices.ga * 0.6)
  const level: MarketingLevel = spendTarget >= 8_000 ? 'major' : spendTarget >= 4_000 ? 'heavy' : spendTarget >= 1_500 ? 'standard' : spendTarget >= 400 ? 'low' : 'none'
  ev.marketing.level = level
  ev.marketing.budget = level === 'major' ? Math.round(spendTarget) : E.marketing.budgets[level]
  const stratMap: Record<string, PromoStrategy> = { money: maxPop(state, ev) >= 55 ? 'superstar' : 'aggressive', prospectFactory: 'local', regional: 'local', traditional: 'standard' }
  ev.marketing.strategy = stratMap[strat]
  // Marketing never exceeds what the building can use.
  if (ev.marketing.budget > promo.cash * 0.1) { ev.marketing.budget = Math.round(promo.cash * 0.1); ev.marketing.level = ev.marketing.budget >= 5_000 ? 'heavy' : ev.marketing.budget >= 2_000 ? 'standard' : ev.marketing.budget > 0 ? 'low' : 'none' }

  // Broadcast: whichever option nets the most, PPV only for real draws.
  let best: BroadcastKind = 'none', bestNet = 0
  for (const kind of ['localTv', 'nationalTv', 'streaming'] as BroadcastKind[]) {
    const t = broadcastTerms(state, ev, kind, 'public')
    const net = t.fee - t.production
    if (t.available && net > bestNet) { best = kind; bestNet = net }
  }
  if (strat === 'money' && cardQuality(state, ev).main >= 55 && broadcastTerms(state, ev, 'ppv', 'public').available && rng.chance(0.6)) best = 'ppv'
  ev.broadcast.kind = best
  ev.broadcast.ppvPrice = ppvRefPrice(interest)
}
