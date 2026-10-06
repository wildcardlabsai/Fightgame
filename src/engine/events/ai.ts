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
import { keyedFloat, keyedNormal, type Rng } from '../rng'
import type { BoxingEvent, BroadcastKind, Fight, GameState, Id, MarketingLevel, Promotion, PromoStrategy, Venue, VenueTier } from '../types'
import { baseMoney, valueOf } from '../market'
import { bookable, pickOpponent, weeksSince } from '../systems/aiFights'
import { behaviour } from '../systems/aiFinance'
import { broadcastTerms, cardFights, demandFor, eventInterest, fightAppeal, ppvBuysFor, ppvRefPrice, refPrices, soldFromDemand } from './demand'
import { attachFight, createEventInternal, startSales, venueBookedOn } from './events'
import { isEventOpen } from './lifecycle'

const E = B.events
const SAT = 5
const TIER_ORDER: VenueTier[] = ['local', 'regional', 'national', 'arena', 'stadium']
const MAX_TIER: Record<string, number> = { Startup: 1, Regional: 2, National: 3, Major: 4, Global: 4 }
const FIGHTS_RANGE: Record<string, [number, number]> = { Startup: [3, 5], Regional: [4, 7], National: [5, 8], Major: [6, 10], Global: [7, 10] }
const MAX_OPEN: Record<string, number> = { Startup: 1, Regional: 2, National: 3, Major: 4, Global: 5 }

/** Diagnostics for the balance audit (not part of game state). */
export const aiStats: Record<string, { attempts: number; fewFights: number; noVenue: number; ok: number }> = {}
const stat = (p: Promotion) => (aiStats[p.name] ??= { attempts: 0, fewFights: 0, noVenue: 0, ok: 0 })

export function aiEvents(state: GameState, rng: Rng): void {
  const promos = rng.shuffle(Object.values(state.promotions).filter((p) => !p.isPlayer && p.ai))
  const playerRoster = new Set(Object.values(state.contracts).filter((c) => c.promotionId === state.playerPromotionId).map((c) => c.fighterId))
  for (const promo of promos) {
    const ai = promo.ai!
    if (ai.fin.collapsing || ai.fin.state === 'insolvent') continue
    const b = behaviour(promo)
    const open = Object.values(state.events).filter((e) => e.promotionId === promo.id && isEventOpen(e))
    const maxOpen = ai.fin.state === 'struggling' || ai.fin.state === 'critical' ? 1 : MAX_OPEN[promo.tier] + (ai.strategy === 'prospectFactory' ? 1 : 0)
    if (open.length >= maxOpen) continue
    const style = ai.strategy === 'prospectFactory' ? 0.7 : ai.strategy === 'money' ? 1.15 : 1
    const cadence = E.ai.cadenceWeeks[promo.tier] * b.cadence * style
    if (!rng.chance(1 / cadence)) continue
    planEvent(state, promo, rng, playerRoster)
  }
}

/** Strategy caps the size of room a promotion will consider; finance state lowers it further. */
const STRATEGY_TIER_CAP: Record<string, number> = { prospectFactory: 1, regional: 2, traditional: 3, money: 4 }

/** What this promoter *believes* demand will be, relative to the public model: bias and noise by competence. Keyed, so deterministic. */
function perceptionFactor(state: GameState, promo: Promotion, day: number): number {
  const c = E.ai.competence[promo.ai!.competence]
  return Math.exp(c.bias + c.sd * keyedNormal(state.seed, 'aiperc', promo.id, day))
}

function planEvent(state: GameState, promo: Promotion, rng: Rng, playerRoster: Set<Id>): void {
  const ai = promo.ai!
  stat(promo).attempts++
  const [lo, hi] = E.ai.leadWeeks
  const day = state.today + SAT + 7 * rng.int(lo, hi)
  // Card size: what a promotion of this scale normally stages, shifted by style (prospect shows are small, money shows are big).
  const [tLo, tHi] = FIGHTS_RANGE[promo.tier]
  const shift = ai.strategy === 'prospectFactory' ? -2 : ai.strategy === 'money' ? 1 : 0
  const target = Math.max(3, Math.min(10, rng.int(tLo, tHi) + shift))
  const contracts = Object.values(state.contracts).filter((c) => c.promotionId === promo.id)
  const needy = contracts
    .map((c) => ({ c, f: state.fighters[c.fighterId] }))
    .filter((x) => x.f && bookable(state, x.f, day) && weeksSince(state, x.f) >= B.fights.restWeeks + 2)
    .sort((a, b) => weeksSince(state, b.f) - weeksSince(state, a.f))

  // Build the fights first (agreed, unscheduled); the venue follows from how good the card is.
  const fights: Fight[] = []
  let committed = 0
  const cashCover = ai.fin.state === 'healthy' || ai.fin.state === 'established' || ai.fin.state === 'growing' ? 1.4 : 2.4
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
    if (promo.cash < (committed + cost) * cashCover) continue
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
  if (fights.length < 3) { stat(promo).fewFights++; return abort() }

  const u = perceptionFactor(state, promo, day)
  const mktMult = E.ai.competence[ai.competence].mktRange[0] + (E.ai.competence[ai.competence].mktRange[1] - E.ai.competence[ai.competence].mktRange[0]) * keyedFloat(state.seed, 'aimkt', promo.id, day)
  const venue = pickVenue(state, promo, fights, day, committed, u, mktMult)
  if (!venue) { stat(promo).noVenue++; return abort() }
  while (fights.length > venue.maxFights) { const f = fights.pop()!; cancelFight(state, f, 'dropped from the card') }

  const ev = createEventInternal(state, promo.id, { name: eventName(state, promo, venue), day, venueId: venue.id }, 'ai')
  for (const f of fights.sort((a, b) => fightAppeal(state, a) - fightAppeal(state, b))) attachFight(state, ev, f)
  configure(state, ev, promo, rng, u, mktMult)
  startSales(state, ev)
  stat(promo).ok++
  // The promoter's OWN expectation (its read of demand, with its own error band) — kept so the audit can compare it with what happens.
  {
    const c = E.ai.competence[ai.competence]
    const d = demandFor(state, ev, 'public', ev.prices, ev.marketing.budget)
    const sc = Math.min(1.6, u)
    const at = (k: number) => soldFromDemand({ ...d, ga: d.ga * sc * k, premium: d.premium * sc * k, vip: d.vip * sc * k }, state.venues[ev.venueId]).reduce((a, b) => a + b, 0)
    ev.forecast = { att: [at(1 - c.sd), at(1 + c.sd)], profit: ev.forecast?.profit ?? [0, 0] }
  }
  ev.sponsor.accepted = ev.sponsor.offers.slice().sort((a, b) => b.fixedFee - a.fixedFee).find((o) => o.minMainPopularity <= maxPop(state, ev) + 5) ?? null
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

function promoStrategy(state: GameState, promo: Promotion, ev: BoxingEvent): PromoStrategy {
  const stratMap: Record<string, PromoStrategy> = { money: maxPop(state, ev) >= 55 ? 'superstar' : 'aggressive', prospectFactory: 'local', regional: 'local', traditional: 'standard' }
  return stratMap[promo.ai!.strategy]
}

/** What the promoter plans to spend promoting a show in this building (a share of the gate it hopes for). */
function planSpend(promo: Promotion, v: Venue, gaRef: number, mktMult: number): number {
  const ai = promo.ai!
  const share = E.ai.marketingShare[ai.strategy]
  return Math.round(share * behaviour(promo).marketing * mktMult * Math.max(8_000, v.capacity * gaRef * 0.6))
}

/**
 * Venue choice is a decision under uncertainty, not an optimisation: each promoter judges demand with its own error
 * (competence), accepts a lower expected fill the bigger its appetite for risk, is capped by its style and by how
 * healthy its finances are, and the weakest sometimes overreach.
 */
function pickVenue(state: GameState, promo: Promotion, fights: Fight[], day: number, committed: number, u: number, mktMult: number): Venue | null {
  const ai = promo.ai!
  const b = behaviour(promo)
  const comp = E.ai.competence[ai.competence]
  const n = fights.length
  const capIdx = Math.max(0, Math.min(MAX_TIER[promo.tier], STRATEGY_TIER_CAP[ai.strategy] ?? 3) - b.tierDrop)
  const budget = Math.max(0, promo.cash - committed * 1.3) * (0.1 + 0.08 * ai.risk)
  let options = Object.values(state.venues)
    .filter((v) => TIER_ORDER.indexOf(v.tier) <= capIdx && v.minFights <= n && v.hireCost <= budget && !venueBookedOn(state, v.id, day))
  if (ai.strategy === 'regional') { const home = options.filter((v) => v.country === promo.homeCountry); if (home.length) options = home }
  if (options.length === 0) return null
  const want = 0.95 - 0.45 * ai.risk
  const scored = options.map((v) => {
    const ev = draftEvent(state, promo, fights, v, day)
    ev.marketing.strategy = promoStrategy(state, promo, ev)
    const ref = refPrices(eventInterest(state, ev))
    const spend = planSpend(promo, v, ref.ga, mktMult)
    ev.prices = ref
    const d = demandFor(state, ev, 'public', ref, spend)
    const fill = (soldFromDemand(d, v).reduce((a, c) => a + c, 0) / v.capacity) * Math.min(1.6, u)
    return { v, fill, home: v.country === promo.homeCountry ? 1 : 0 }
  })
  scored.sort((a, c) => c.v.capacity * (1 + 0.15 * c.home) - a.v.capacity * (1 + 0.15 * a.home))
  const fits = scored.filter((x) => x.fill >= want)
  let choice = fits.length ? fits[0] : scored.slice().sort((a, c) => c.fill - a.fill)[0]
  // The weakest promoters sometimes reach for a bigger room than the card justifies.
  const bigger = scored.filter((x) => x.v.capacity > choice.v.capacity)
  if (bigger.length && keyedFloat(state.seed, 'aiover', promo.id, day) < comp.overreach) choice = bigger[bigger.length - 1 - Math.floor(keyedFloat(state.seed, 'aiover2', promo.id, day) * Math.min(2, bigger.length))] ?? choice
  return choice.v
}

/** Prices, marketing, broadcast and sponsor the way this promotion's style and competence would. */
function configure(state: GameState, ev: BoxingEvent, promo: Promotion, _rng: Rng, u: number, mktMult: number): void {
  const ai = promo.ai!
  const comp = E.ai.competence[ai.competence]
  const v0 = state.venues[ev.venueId]
  const interest = eventInterest(state, ev)
  const ref = refPrices(interest)
  const stratMult = { money: 1.1, prospectFactory: 0.88, traditional: 1, regional: 0.93 }[ai.strategy]
  ev.marketing.strategy = promoStrategy(state, promo, ev)
  const spend = planSpend(promo, v0, ref.ga, mktMult)
  ev.marketing.budget = Math.round(Math.min(spend, Math.max(0, promo.cash * 0.08)))
  const priceAt = (f: number) => ({ ga: Math.max(8, Math.round(ref.ga * f)), premium: Math.round(ref.premium * f), vip: Math.round(ref.vip * f) })
  // Pricing: the skilled push the gate as far as their own read of demand allows while still expecting a well-filled hall
  // (promoters hate empty seats); the unskilled guess. Nobody prices to the exact clearing point.
  // Rule of thumb: a card that looks like it will overfill the room deserves dearer tickets, a weak one cheaper; the unskilled
  // apply it clumsily (keyed noise), the skilled go on to optimise.
  const dRef = demandFor(state, ev, 'public', ref, ev.marketing.budget)
  const fillAtRef = (((dRef.ga + dRef.premium + dRef.vip) * Math.min(1.6, u)) / v0.capacity)
  let f = stratMult * Math.pow(Math.max(0.6, Math.min(3, fillAtRef)), 0.4) * Math.exp(keyedNormal(state.seed, 'aiprice', ev.id) * (0.26 - 0.2 * comp.priceSkill))
  // Skilled promoters price to a comfortable house (they would rather have a full, loud room than squeeze the last pound);
  // risk-takers aim tighter. They solve for that on their OWN noisy read of demand, so they still miss.
  {
    const skilled = keyedFloat(state.seed, 'aiskill', ev.id) < comp.priceSkill
    const target = (0.78 + 0.12 * ai.risk) * (skilled ? 1 : Math.exp(keyedNormal(state.seed, 'aitarget', ev.id) * 0.3))
    let chosen = 0.7
    for (let m = 0.7; m <= 3; m += 0.05) {
      const pr = priceAt(m * stratMult)
      const d = demandFor(state, ev, 'public', pr, ev.marketing.budget)
      if (((d.ga + d.premium + d.vip) * Math.min(1.6, u)) / v0.capacity >= target) chosen = m; else break
    }
    f = skilled ? chosen * stratMult : Math.sqrt(f * chosen * stratMult)
  }
  ev.prices = priceAt(f)
  const levelOf = (b: number): MarketingLevel => (b >= 10_000 ? 'major' : b >= 5_000 ? 'heavy' : b >= 2_000 ? 'standard' : b >= 500 ? 'low' : 'none')
  ev.marketing.level = levelOf(ev.marketing.budget)

  // Broadcast: whichever option nets the most on its own read; PPV only for promoters willing to gamble on a draw.
  let best: BroadcastKind = 'none', bestNet = 0
  for (const kind of ['localTv', 'nationalTv', 'streaming'] as BroadcastKind[]) {
    const t = broadcastTerms(state, ev, kind, 'public')
    const net = (kind === 'streaming' ? t.fee * u : t.fee) - t.production
    if (t.available && net > bestNet) { best = kind; bestNet = net }
  }
  // PPV only when the promoter's own sums say it beats the best fixed deal by a margin (risk-takers want a smaller margin).
  // The sums use its own noisy read of demand, so over-optimists gamble when they should not.
  if (broadcastTerms(state, ev, 'ppv', 'public').available) {
    const price = ppvRefPrice(interest)
    const buys = ppvBuysFor(state, ev, 'public', price) * Math.pow(Math.min(1.6, u), 1.5)
    const ppvNet = buys * price * E.ppv.promoterShare - broadcastTerms(state, ev, 'ppv', 'public').production
    if (ppvNet > 0 && ppvNet > bestNet * (1.9 - 0.8 * ai.risk) + 20_000) best = 'ppv'
  }
  ev.broadcast.kind = best
  ev.broadcast.ppvPrice = ppvRefPrice(interest)
}
