/**
 * EVENT DEMAND, QUALITY AND FORECASTS
 * -----------------------------------
 * One model, two modes:
 *   'public'  — what the player (and AI) can know: popularity, reputation, records, form, rivalry, venue, price.
 *               Forecasts are ranges built from this. It never reads hidden fighter attributes.
 *   'actual'  — the same model times hidden factors (true marketability of the headliners, a keyed noise draw).
 *               This is what actually happens, so forecasts can miss.
 */
import { marketingBonus } from '../sponsorCatalog'
import { tierAllowsBroadcast } from '../tiers'
import { regionOf } from '../../data/nations'
import { dayToDate } from '../calendar'
import { BALANCE as B } from '../balance'
import { clamp } from '../fighters'
import { publicExpectation } from '../fights'
import { keyedNormal } from '../rng'
import { mediaAppeal, mediaHype } from '../media/effects'
import type { BoxingEvent, BroadcastKind, Fight, Fighter, GameState, Promotion, TicketPrices, Venue, WeightClassId } from '../types'

const E = B.events

export const DIVISION_IMPORTANCE: Record<WeightClassId, number> = {
  heavyweight: 1, cruiserweight: 0.85, lightHeavyweight: 0.85, superMiddleweight: 0.9, middleweight: 0.95, superWelterweight: 0.9, welterweight: 1,
  superLightweight: 0.9, lightweight: 0.95, superFeatherweight: 0.8, featherweight: 0.8, superBantamweight: 0.72, bantamweight: 0.7,
  superFlyweight: 0.62, flyweight: 0.6, lightFlyweight: 0.55, minimumweight: 0.5,
}

export interface Range { lo: number; hi: number }

export function cardFights(state: GameState, ev: BoxingEvent): Fight[] {
  return ev.card.map((id) => state.fights[id]).filter((f): f is Fight => !!f && f.status !== 'cancelled')
}

export function venueOf(state: GameState, ev: BoxingEvent): Venue {
  return state.venues[ev.venueId]
}

// --------------------------------------------------------------- Fight appeal

/** How much the public wants to see this fight. 0–100, public information only. */
export function fightAppeal(state: GameState, fight: Fight): number {
  const a = state.fighters[fight.sideA.fighterId], b = state.fighters[fight.sideB.fighterId]
  if (!a || !b) return 0
  const hi = Math.max(a.popularity, b.popularity), lo = Math.min(a.popularity, b.popularity)
  const star = 0.7 * hi + 0.3 * lo
  const rep = (a.reputation + b.reputation) / 2
  let v = 0.68 * star + 0.32 * rep
  const pExp = publicExpectation(state, a, b)
  const competitive = 1 - Math.abs(pExp - 0.5) * 1.2
  v *= 0.85 + 0.3 * competitive
  const fa = a.record.wins + a.record.losses + a.record.draws, fb = b.record.wins + b.record.losses + b.record.draws
  if (a.record.losses === 0 && b.record.losses === 0 && fa >= 8 && fb >= 8) v += 6
  v += ((a.momentum + b.momentum) / 200) * 4
  v += Math.min(10, rivalryHeat(state, a, b) * 4)
  v += mediaAppeal(state, a.id, b.id)
  v *= 0.9 + 0.2 * (DIVISION_IMPORTANCE[fight.weightClass] ?? 0.8)
  return clamp(v, 0, 100)
}

/** Public: previous meetings that were close or ended in stoppages create heat. */
export function rivalryHeat(state: GameState, a: Fighter, b: Fighter): number {
  let heat = 0
  for (const id of a.recentFights) {
    const f = state.fights[id]
    if (!f?.result) continue
    if ((f.sideA.fighterId === b.id || f.sideB.fighterId === b.id)) heat += ['SD', 'MD', 'SDRAW', 'MDRAW', 'DRAW', 'KO', 'TKO'].includes(f.result.method) ? 2 : 1
  }
  return heat
}

export interface CardQuality { score: number; main: number; coMain: number; depth: number; mainFight: Fight | null; coMainFight: Fight | null }

export function cardQuality(state: GameState, ev: BoxingEvent): CardQuality {
  const fights = cardFights(state, ev)
  if (fights.length === 0) return { score: 0, main: 0, coMain: 0, depth: 0, mainFight: null, coMainFight: null }
  const main = fights[fights.length - 1]
  const co = fights.length > 1 ? fights[fights.length - 2] : null
  const rest = fights.slice(0, Math.max(0, fights.length - 2))
  const mA = fightAppeal(state, main), cA = co ? fightAppeal(state, co) : 0
  const dA = rest.length ? rest.reduce((n, f) => n + fightAppeal(state, f), 0) / rest.length : 0
  let score: number
  if (!co) score = mA * 0.9
  else if (rest.length === 0) score = 0.72 * mA + 0.28 * cA
  else score = 0.58 * mA + 0.2 * cA + 0.22 * dA * Math.min(1, 0.55 + rest.length * 0.12)
  return { score: clamp(score, 0, 100), main: mA, coMain: cA, depth: dA, mainFight: main, coMainFight: co }
}

// --------------------------------------------------------------------- Interest

export function promoStrength(p: Promotion): number {
  return clamp(0.7 * p.reputation + 0.3 * Math.log10(p.fanbase + 1) * 14, 0, 100)
}

/** Overall interest in the show, 0–100. */
export function eventInterest(state: GameState, ev: BoxingEvent): number {
  const q = cardQuality(state, ev)
  const p = state.promotions[ev.promotionId]
  const v = venueOf(state, ev)
  const w = E.interestWeights
  return clamp(w.main * q.main + w.coMain * q.coMain + w.depth * q.depth + w.promo * promoStrength(p) + w.importance * v.prestige * 18 + mediaHype(state, ev.id), 0, 100)
}

/** Share of the card drawn from the venue's home turf. 0–1. */
function localTies(state: GameState, ev: BoxingEvent): number {
  const v = venueOf(state, ev)
  const fights = cardFights(state, ev)
  let sum = 0, wsum = 0
  fights.forEach((f, i) => {
    const w = i === fights.length - 1 ? 0.5 : i === fights.length - 2 ? 0.2 : 0.3 / Math.max(1, fights.length - 2)
    for (const side of [f.sideA, f.sideB]) {
      const fighter = state.fighters[side.fighterId]
      const tie = fighter.hometown === v.city ? 1 : fighter.nationality === v.country ? 0.75 : regionOf(fighter.nationality) === regionOf(v.country) ? 0.25 : 0
      sum += tie * w * (0.5 + fighter.popularity / 100); wsum += w * (0.5 + fighter.popularity / 100)
    }
  })
  return wsum ? sum / wsum : 0
}

// ---------------------------------------------------------------- Marketing

export function awarenessFor(state: GameState, ev: BoxingEvent, spend: number): number {
  const v = venueOf(state, ev)
  const s = E.marketing.strategies[ev.marketing.strategy]
  const scale = E.marketing.scaleBase + E.marketing.scalePerSeat * v.capacity
  const eff = spend / s.cost
  return 100 * (1 - Math.exp(-(eff * s.reach) / scale))
}

/** How much of the country a campaign reaches. Scaled to the promotion's following, not the venue. */
export function nationalAwareness(state: GameState, ev: BoxingEvent, spend: number): number {
  const s = E.marketing.strategies[ev.marketing.strategy]
  const scale = E.ppv.campaignScale + E.ppv.campaignPerFan * state.promotions[ev.promotionId].fanbase
  return 100 * (1 - Math.exp(-((spend / s.cost) * s.reach) / scale))
}

// ------------------------------------------------------------------- Demand

export interface Demand {
  /** Tickets people would buy at the current prices, before capacity. */
  ga: number
  premium: number
  vip: number
  interest: number
  /** National-level audience at the reference price (venue independent) — drives TV/PPV. */
  reach: number
  /** National audience before the venue's local campaign (PPV and TV are not limited by the building). */
  baseReach: number
  refPrices: TicketPrices
}

export function refPrices(interest: number): TicketPrices {
  const ga = Math.round(E.priceRefBase + E.priceRefPerInterest * interest)
  return { ga, premium: Math.round(ga * E.premiumMult), vip: Math.round(ga * E.vipMult) }
}

/** Rival shows on the same night in the same country take part of your audience. */
function competitionFactor(state: GameState, ev: BoxingEvent): number {
  let hit = 0
  for (const o of Object.values(state.events)) {
    if (o.id === ev.id || o.status === 'cancelled' || Math.abs(o.day - ev.day) > 2) continue
    if (o.country !== ev.country) continue
    const oi = o.card.length ? eventInterest(state, o) : 0
    hit += 0.04 + 0.12 * (oi / 100)
  }
  return 1 - Math.min(E.noise.competitionMax, hit)
}

/** Hidden factor applied only to ACTUAL outcomes: the headliners' true pull plus every source of real-world noise. */
function hiddenFactor(state: GameState, ev: BoxingEvent): number {
  const fights = cardFights(state, ev)
  const heads = fights.slice(-2).flatMap((f) => [state.fighters[f.sideA.fighterId], state.fighters[f.sideB.fighterId]])
  const mk = heads.length ? heads.reduce((n, f) => n + f.attributes.marketability, 0) / heads.length : 50
  const N = E.noise
  const dn = B.difficulty[state.settings.difficulty].demandNoise
  const v = venueOf(state, ev)
  const year = Math.floor((ev.day - state.startDay) / 365)
  const month = dayToDate(ev.day).getUTCMonth()
  const logNoise =
    keyedNormal(state.seed, 'evdemand', ev.id) * N.event +
    keyedNormal(state.seed, 'evlocal', ev.id) * N.local +
    keyedNormal(state.seed, 'economy', year) * N.economy +
    keyedNormal(state.seed, 'weather', ev.id) * (N.weather[v.tier] ?? 0.03)
  return Math.exp(logNoise * dn) * (1 + 0.12 * ((mk - 50) / 50)) * E.season[month] * competitionFactor(state, ev)
}

export function demandFor(state: GameState, ev: BoxingEvent, mode: 'public' | 'actual', prices: TicketPrices = ev.prices, spend = ev.marketing.spent): Demand {
  const interest = eventInterest(state, ev)
  const p = state.promotions[ev.promotionId]
  const v = venueOf(state, ev)
  const strat = E.marketing.strategies[ev.marketing.strategy]
  const q = cardQuality(state, ev)
  const ties = localTies(state, ev)
  const local = 1 + 0.45 * ties * strat.local
  const foreign = ties === 0 && p.homeCountry !== v.country && regionOf(p.homeCountry) !== regionOf(v.country) ? 0.85 : 1
  const home = p.homeCountry === v.country ? 1.06 : 1
  const promoF = 0.8 + 0.7 * Math.pow(p.reputation / 100, 0.8)
  const aw = awarenessFor(state, ev, spend)
  const starBoost = 1 + strat.star * (q.main / 100)
  const mktLuck = mode === 'actual' ? Math.exp(keyedNormal(state.seed, 'evmkt', ev.id) * E.noise.marketing * B.difficulty[state.settings.difficulty].demandNoise) : 1
  const mkt = 1 + E.marketing.maxDemandBoost * (aw / 100) * starBoost * mktLuck * (1 + marketingBonus(state, p.isPlayer))
  const base = E.demandScale * Math.pow(Math.max(interest, 1) / 10, E.demandExp)
  const hidden = mode === 'actual' ? hiddenFactor(state, ev) : 1
  const reach = base * promoF * mkt * hidden
  const stay = E.cannibal[ev.broadcast.kind] ?? 1
  const A0 = reach * v.market * local * foreign * home * stay
  const ref = refPrices(interest)
  const amax = A0 / (1 / (1 + Math.pow(1 / 1.15, E.priceShape)))
  // How much this city will really pay differs from the "reference" the player sees (hidden; learned from sales).
  const wealth = mode === 'actual' ? Math.exp(keyedNormal(state.seed, 'pricesens', v.id) * E.noise.priceSens * B.difficulty[state.settings.difficulty].demandNoise) : 1
  const tier = (price: number, refP: number, share: number) => (share * amax) / (1 + Math.pow(price / (1.15 * refP * wealth), E.priceShape))
  return {
    ga: tier(prices.ga, ref.ga, 1), premium: tier(prices.premium, ref.premium, E.premiumShare), vip: tier(prices.vip, ref.vip, E.vipShare),
    interest, reach, baseReach: base * promoF * hidden, refPrices: ref,
  }
}

export function inventory(v: Venue): [number, number, number] {
  const s = E.seatSplit
  const ga = Math.floor(v.capacity * s.ga), premium = Math.floor(v.capacity * s.premium)
  return [ga, premium, v.capacity - ga - premium]
}

export function soldFromDemand(d: Demand, v: Venue): [number, number, number] {
  const inv = inventory(v)
  return [Math.min(inv[0], Math.round(d.ga)), Math.min(inv[1], Math.round(d.premium)), Math.min(inv[2], Math.round(d.vip))]
}

/** Cumulative share of final demand that has been sold at progress x (0–1); hot shows sell early. */
export function salesCurve(x: number, interest: number): number {
  const c = clamp(x, 0, 1)
  const slow = 0.28 * Math.sqrt(c) + 0.3 * c + 0.42 * Math.pow(c, 4)
  const hot = 0.5 * Math.sqrt(c) + 0.3 * c + 0.2 * Math.pow(c, 4)
  const h = clamp((interest - 40) / 40, 0, 1)
  return (1 - h) * slow + h * hot
}

// ----------------------------------------------------------------------- PPV / TV

export function ppvRefPrice(interest: number): number { return Math.round((E.ppv.priceBase + E.ppv.priceInterest * interest) * 100) / 100 }

export function ppvBuysFor(state: GameState, ev: BoxingEvent, mode: 'public' | 'actual', price = ev.broadcast.ppvPrice): number {
  const d = demandFor(state, ev, mode)
  const conf = E.ppv
  const cq = cardQuality(state, ev)
  const star = Math.pow(Math.max(0.01, cq.main) / conf.ref, conf.exp)
  const ref = ppvRefPrice(d.interest)
  const priceF = (1 + Math.pow(1 / 1.15, conf.priceShape)) / (1 + Math.pow(price / (1.15 * ref), conf.priceShape))
  // PPV is bought, not walked up to: it lives or dies on a NATIONAL campaign (sized to the promotion's fanbase, not the building).
  const aw = nationalAwareness(state, ev, mode === 'actual' ? ev.marketing.spent : plannedSpend(ev))
  const campaign = E.ppv.campaignFloor + (1.35 - E.ppv.campaignFloor) * (aw / 100)
  const luck = mode === 'actual' ? Math.exp(keyedNormal(state.seed, 'ppvnoise', ev.id) * E.noise.ppv * B.difficulty[state.settings.difficulty].demandNoise) : 1
  return Math.max(0, Math.round(d.baseReach * conf.scale * star * priceF * luck * campaign))
}

export function viewersFor(state: GameState, ev: BoxingEvent, mode: 'public' | 'actual'): number {
  const d = demandFor(state, ev, mode)
  const aw = nationalAwareness(state, ev, mode === 'actual' ? ev.marketing.spent : plannedSpend(ev))
  return Math.round(1.6 * d.baseReach * (0.8 + 0.5 * (aw / 100)) * Math.pow(Math.max(d.interest, 1) / 40, 1.1))
}

export interface BroadcastOption { kind: BroadcastKind; label: string; available: boolean; reason: string | null; production: number; guaranteed: number; note: string }

export function broadcastTerms(state: GameState, ev: BoxingEvent, kind: BroadcastKind, mode: 'public' | 'actual'): { fee: number; production: number; available: boolean; reason: string | null } {
  const p = state.promotions[ev.promotionId]
  const q = cardQuality(state, ev)
  const interest = eventInterest(state, ev)
  const tv = E.tv
  switch (kind) {
    case 'none': return { fee: 0, production: 0, available: true, reason: null }
    case 'localTv': return { fee: Math.round(tv.local.base + tv.local.perInterest * interest), production: tv.local.production, available: true, reason: null }
    case 'nationalTv': {
      const tierOk = !p.isPlayer || tierAllowsBroadcast(p.tier, 'nationalTv')
      const ok = tierOk && p.reputation >= tv.national.minRep && q.score >= tv.national.minQuality
      return { fee: ok ? Math.round(tv.national.base + tv.national.perInterest * interest) : 0, production: tv.national.production, available: ok, reason: ok ? null : !tierOk ? 'National TV opens up at Regional promotion level' : p.reputation < tv.national.minRep ? `Needs promotion reputation ${tv.national.minRep}+` : `Needs a stronger card (quality ${tv.national.minQuality}+)` }
    }
    case 'streaming': {
      const tierOk = !p.isPlayer || tierAllowsBroadcast(p.tier, 'streaming')
      const ok = tierOk && p.reputation >= tv.streaming.minRep
      return { fee: Math.round(viewersFor(state, ev, mode) * tv.streaming.perViewer), production: tv.streaming.production, available: ok, reason: ok ? null : !tierOk ? 'Streaming deals open up at Regional promotion level' : `Needs promotion reputation ${tv.streaming.minRep}+` }
    }
    case 'ppv': {
      const tierOk = !p.isPlayer || tierAllowsBroadcast(p.tier, 'ppv')
      const ok = tierOk && p.reputation >= 12 && q.main >= 25
      return { fee: 0, production: Math.round(tv.ppvProduction.base + tv.ppvProduction.perInterestSq * interest * interest), available: ok, reason: ok ? null : !tierOk ? 'Pay-per-view opens up at National promotion level' : 'PPV needs a recognisable main event and a known promotion' }
    }
  }
}

// ------------------------------------------------------------------------ Costs

/** Venue rental for this promotion. The player pays the difficulty-adjusted price; rivals pay list. */
export function hireFor(state: GameState, v: Venue, promotionId: string): number {
  return Math.round(v.hireCost * (promotionId === state.playerPromotionId ? B.difficulty[state.settings.difficulty].venueCost : 1))
}

export function productionCost(v: Venue): number {
  return Math.round(E.costs.productionByLevel[v.production - 1] + E.costs.productionPerSeat * v.capacity)
}

export function officialsCost(nFights: number): number {
  return E.costs.officialsBase + nFights * (E.costs.officialsPerFight + E.costs.medicalPerFight)
}

/** Purses and expected win bonuses promised on the card (public: they are the player's own contracts and agreed terms). */
export function purseCommitments(state: GameState, ev: BoxingEvent): { purses: number; bonusesExpected: number; bonusesMax: number } {
  let purses = 0, bonusesExpected = 0, bonusesMax = 0
  for (const f of cardFights(state, ev)) {
    purses += f.terms.purseA + f.terms.purseB
    bonusesExpected += 0.5 * (f.terms.winBonusA + f.terms.winBonusB)
    bonusesMax += Math.max(f.terms.winBonusA, f.terms.winBonusB)
  }
  return { purses, bonusesExpected, bonusesMax }
}

// ------------------------------------------------------------------- Forecast

export function forecastError(state: GameState, promotionId: string): number {
  const p = state.promotions[promotionId]
  const dp = B.difficulty[state.settings.difficulty]
  return dp.forecastError * Math.max(E.forecastError.floor, E.forecastError.start - E.forecastError.perEvent * p.stats.events)
}

const rng = (c: number, err: number): Range => ({ lo: Math.max(0, c * (1 - err)), hi: c * (1 + err * 1.15) })
const addR = (a: Range, b: Range): Range => ({ lo: a.lo + b.lo, hi: a.hi + b.hi })

export interface Forecast {
  cardQuality: Range & { mid: number; label: string }
  interest: number
  demand: Range
  attendance: Range
  fill: Range
  ticketRevenue: Range
  sponsorship: Range
  broadcast: Range
  ppvBuys: Range
  ppvRevenue: Range
  viewers: Range
  revenue: Range
  costs: Range
  profit: Range
  atmosphere: Range
  risk: 'safe' | 'watch' | 'highRisk'
  warnings: string[]
  prices: TicketPrices
  refPrices: TicketPrices
  /** Fixed costs already committed (venue, purses…) — known exactly. */
  committed: number
}

export function sponsorExpected(ev: BoxingEvent): number {
  const s = ev.sponsor.accepted
  return s ? s.fixedFee : 0
}

export function qualityLabel(score: number): string {
  return score >= 75 ? 'Blockbuster' : score >= 58 ? 'Strong' : score >= 40 ? 'Solid' : score >= 22 ? 'Modest' : 'Thin'
}

/** Public forecast: ranges from public information only. */
export function forecastEvent(state: GameState, ev: BoxingEvent): Forecast {
  const err = forecastError(state, ev.promotionId)
  const v = venueOf(state, ev)
  const q = cardQuality(state, ev)
  const d = demandFor(state, ev, 'public', ev.prices, plannedSpend(ev))
  // Ranges come from the UNCAPPED demand estimate, then are clipped to the building: a card that would fill 1.2× the hall
  // honestly reads "likely sell-out", while a card near the edge reads "could miss".
  const inv = inventory(v)
  const at = (scale: number): [number, number, number] => [Math.min(inv[0], Math.round(d.ga * scale)), Math.min(inv[1], Math.round(d.premium * scale)), Math.min(inv[2], Math.round(d.vip * scale))]
  const loS = at(1 - err), midS = at(1), hiS = at(1 + err * 1.15)
  const tot = (a: number[]) => a[0] + a[1] + a[2]
  const gateOf = (a: number[]) => a[0] * ev.prices.ga + a[1] * ev.prices.premium + a[2] * ev.prices.vip
  const att = tot(midS)
  const fights = cardFights(state, ev)
  const qScore = Math.round(q.score)
  const qr = { lo: Math.max(0, qScore - 9), hi: Math.min(100, qScore + 9), mid: qScore, label: qualityLabel(qScore) }
  const attR = { lo: tot(loS), hi: tot(hiS) }
  const demandTotal = d.ga + d.premium + d.vip
  const ticketR = { lo: gateOf(loS), hi: gateOf(hiS) }
  const sponsorR = ev.sponsor.accepted ? { lo: sponsorExpected(ev) * 0.5, hi: sponsorExpected(ev) + (ev.sponsor.accepted.attendanceBonus?.amount ?? 0) + (ev.sponsor.accepted.qualityBonus?.amount ?? 0) } : { lo: 0, hi: 0 }
  const bt = broadcastTerms(state, ev, ev.broadcast.kind, 'public')
  const buys = ev.broadcast.kind === 'ppv' ? ppvBuysFor(state, ev, 'public') : 0
  const ppvR = rng(buys, Math.min(0.85, err * 2.2))
  const ppvRev = { lo: ppvR.lo * ev.broadcast.ppvPrice * E.ppv.promoterShare, hi: ppvR.hi * ev.broadcast.ppvPrice * E.ppv.promoterShare }
  const viewersR = rng(viewersFor(state, ev, 'public'), err * 1.3)
  const bR: Range = ev.broadcast.kind === 'streaming' ? { lo: viewersR.lo * E.tv.streaming.perViewer, hi: viewersR.hi * E.tv.streaming.perViewer } : ev.broadcast.kind === 'none' || ev.broadcast.kind === 'ppv' ? { lo: 0, hi: 0 } : { lo: bt.fee, hi: bt.fee }
  const revenue = addR(addR(addR(ticketR, sponsorR), bR), ev.broadcast.kind === 'ppv' ? ppvRev : { lo: 0, hi: 0 })
  const c = purseCommitments(state, ev)
  const fixed = hireFor(state, v, ev.promotionId) + productionCost(v) + bt.production + officialsCost(fights.length) + c.purses + ev.marketing.budget
  const variable = { lo: attR.lo * E.costs.securityPerHead + ticketR.lo * E.costs.sanctionShare + c.bonusesExpected * 0.7, hi: attR.hi * E.costs.securityPerHead + ticketR.hi * E.costs.sanctionShare + c.bonusesMax }
  const costs: Range = { lo: fixed + variable.lo, hi: fixed + variable.hi }
  const profit: Range = { lo: revenue.lo - costs.hi, hi: revenue.hi - costs.lo }
  const mid = (profit.lo + profit.hi) / 2
  const risk: Forecast['risk'] = fights.length === 0 ? 'watch' : profit.lo > 0 ? 'safe' : profit.hi < 0 || mid < -0.1 * costs.hi ? 'highRisk' : 'watch'
  const fillMid = att / v.capacity
  const warnings: string[] = []
  if (fights.length && attR.hi < v.capacity * 0.3) warnings.push('The venue looks far too big for the likely crowd — an empty building kills atmosphere and wastes money.')
  if (fights.length && attR.lo > v.capacity * 0.95) warnings.push('You may sell out. A bigger venue (or higher prices) could earn more.')
  if (ev.prices.ga > d.refPrices.ga * 1.6) warnings.push('General admission looks expensive for this card.')
  if (ev.prices.ga < d.refPrices.ga * 0.6) warnings.push('General admission looks cheap — you may be leaving money on the table.')
  if (ev.broadcast.kind === 'ppv' && buys < 2000) warnings.push('PPV on a card this size could flop: PPV production alone is costly.')
  const atmo = atmosphereEstimate(q.score, d.interest, fillMid, v)
  return {
    cardQuality: qr, interest: Math.round(d.interest), demand: rng(demandTotal, err), attendance: attR,
    fill: { lo: attR.lo / v.capacity, hi: attR.hi / v.capacity }, ticketRevenue: ticketR, sponsorship: sponsorR, broadcast: bR,
    ppvBuys: ppvR, ppvRevenue: ppvRev, viewers: viewersR, revenue, costs, profit, atmosphere: { lo: Math.max(0, atmo - 10), hi: Math.min(100, atmo + 10) },
    risk, warnings, prices: ev.prices, refPrices: d.refPrices, committed: fixed,
  }
}

/** What the campaign will have spent by showtime (the player's plan counts for forecasting). */
export function plannedSpend(ev: BoxingEvent): number {
  return ev.marketing.budget
}

/** Atmosphere: a full, loud building for a good card. */
export function atmosphereEstimate(quality: number, interest: number, fill: number, v: Venue): number {
  return clamp(0.4 * fill * 100 + 0.25 * quality + 0.2 * interest + 3 * v.prestige - (fill < 0.4 ? (0.4 - fill) * 60 : 0), 0, 100)
}
