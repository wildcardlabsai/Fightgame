/**
 * SCRIPTED PROMOTERS for the balance audit. Each strategy plays through the same public commands as the UI:
 * sign fighters, agree fights, pick a venue from the public forecast (or by its own appetite), price and promote,
 * run the night. They are deliberately imperfect — none of them sees hidden information.
 */
import { addFightToEvent, approach, withdraw, chooseSponsor, createEvent, makeOffer, offerFight, putEventOnSale, runEventToEnd, setEventBroadcast, setEventMarketing, setEventPrices } from '../commands'
import { suggestedFightOffer } from '../fightNegotiation'
import { opponentCandidates } from '../matchmaking'
import { suggestedOffer } from '../negotiation'
import { acceptSponsorOffer, activeDeals } from '../sponsors'
import { TIER_DEFS, tierAllowsVenue } from '../tiers'
import { playerRoster, weeklyBurn } from '../selectors'
import type { PromotionTier, BroadcastKind, FightOffer, GameState, Id, MarketingLevel, PromoStrategy, Venue, VenueTier } from '../types'
import { viewsOf } from '../view'
import { draftEvent } from '../events/ai'
import { broadcastTerms, hireFor, eventInterest, forecastEvent, refPrices, cardQuality } from '../events/demand'
import { playerOpenEvents, venueBookedOn } from '../events/events'

const TIERS: VenueTier[] = ['local', 'regional', 'national', 'arena', 'stadium']

export interface Strategy {
  name: string
  maxTier: VenueTier
  venuePick: 'forecast' | 'ambitious' | 'smallest'
  /** For 'ambitious': the lowest forecast fill (mid) the player will accept in the biggest building. */
  minFill: number
  /** Skip venues whose forecast mid-profit is below this (£). Aggressive players accept losses. */
  minForecastProfit: number
  marketing: Record<VenueTier, MarketingLevel>
  promo: PromoStrategy
  priceMult: number
  /** Try higher ticket prices against the public forecast and keep the best (what a good promoter does when a card sells out). */
  priceSearch?: boolean
  broadcast: BroadcastKind[]
  ppvMinMainAppeal: number
  rosterTarget: number
  sign: 'solid' | 'cheap' | 'stars' | 'prospects'
  /** Share of cash a single signing may consume. */
  signShare: number
  signCashFloor: number
  maxConcurrent: number
  cardMin: number
  cardMax: number
  opponents: 'cheap' | 'matched' | 'big'
  /** Weeks of lead for new shows. */
  lead: number
  cashFloor: number
  hireShare: number
  /** Largest forecast loss (low end) tolerated, as a share of cash. */
  maxLossShare: number
  /** 'stars' strategies only chase big names once they have this much cash (a bet needs a stake). */
  investAbove: number
  /** …and only once the promotion has grown to this tier: a star cannot pay in a building the promotion is not yet allowed to book. */
  betTier: PromotionTier
}

const M = (local: MarketingLevel, reg: MarketingLevel, nat: MarketingLevel, arena: MarketingLevel, stad: MarketingLevel): Record<VenueTier, MarketingLevel> => ({ local, regional: reg, national: nat, arena, stadium: stad })

export const STRATEGIES: Record<string, Strategy> = {
  conservative: { name: 'A Conservative', maxTier: 'regional', venuePick: 'forecast', minFill: 0, minForecastProfit: 5_000, marketing: M('low', 'low', 'low', 'low', 'low'), promo: 'local', priceMult: 1, broadcast: ['none', 'localTv'], ppvMinMainAppeal: 999, rosterTarget: 5, sign: 'cheap', signShare: 0.1, signCashFloor: 250_000, maxConcurrent: 1, cardMin: 3, cardMax: 5, opponents: 'cheap', lead: 8, cashFloor: 60_000, hireShare: 0.1, maxLossShare: 0.05, investAbove: 0, betTier: 'Startup' },
  balanced: { name: 'B Balanced', maxTier: 'national', venuePick: 'forecast', minFill: 0, minForecastProfit: -10_000, marketing: M('low', 'standard', 'heavy', 'heavy', 'major'), promo: 'standard', priceMult: 1, priceSearch: true, broadcast: ['none', 'localTv', 'nationalTv', 'streaming'], ppvMinMainAppeal: 999, rosterTarget: 8, sign: 'solid', signShare: 0.15, signCashFloor: 350_000, maxConcurrent: 2, cardMin: 3, cardMax: 7, opponents: 'matched', lead: 9, cashFloor: 80_000, hireShare: 0.2, maxLossShare: 0.1, investAbove: 0, betTier: 'Startup' },
  aggressive: { name: 'C Aggressive', maxTier: 'arena', venuePick: 'ambitious', minFill: 0.5, minForecastProfit: -1e9, marketing: M('standard', 'heavy', 'major', 'major', 'major'), promo: 'aggressive', priceMult: 1.1, priceSearch: true, broadcast: ['nationalTv', 'streaming', 'ppv', 'localTv'], ppvMinMainAppeal: 50, rosterTarget: 10, sign: 'stars', signShare: 0.25, signCashFloor: 450_000, maxConcurrent: 2, cardMin: 3, cardMax: 10, opponents: 'matched', lead: 10, cashFloor: 40_000, hireShare: 0.2, maxLossShare: 0.25, investAbove: 1_000_000, betTier: 'Regional' },
  superstar: { name: 'D Superstar betting', maxTier: 'stadium', venuePick: 'ambitious', minFill: 0.35, minForecastProfit: -1e9, marketing: M('major', 'major', 'major', 'major', 'major'), promo: 'superstar', priceMult: 1.15, priceSearch: true, broadcast: ['ppv', 'nationalTv', 'streaming'], ppvMinMainAppeal: 35, rosterTarget: 6, sign: 'stars', signShare: 0.45, signCashFloor: 900_000, maxConcurrent: 1, cardMin: 3, cardMax: 10, opponents: 'cheap', lead: 12, cashFloor: 30_000, hireShare: 0.3, maxLossShare: 0.4, investAbove: 1_500_000, betTier: 'National' },
  prospects: { name: 'E Prospect factory', maxTier: 'regional', venuePick: 'forecast', minFill: 0, minForecastProfit: -5_000, marketing: M('low', 'standard', 'standard', 'standard', 'standard'), promo: 'local', priceMult: 0.95, broadcast: ['none', 'localTv'], ppvMinMainAppeal: 999, rosterTarget: 9, sign: 'prospects', signShare: 0.08, signCashFloor: 200_000, maxConcurrent: 2, cardMin: 3, cardMax: 6, opponents: 'cheap', lead: 8, cashFloor: 50_000, hireShare: 0.1, maxLossShare: 0.05, investAbove: 0, betTier: 'Startup' },
}

export interface ShowRecord { day: number; tier: VenueTier; venue: string; fights: number; attendance: number; capacity: number; revenue: number; costs: number; profit: number; ppv: number; broadcast: BroadcastKind; sponsor: number; tickets: number; purses: number; forecastAtt?: [number, number]; priceGa: number; mainAppeal: number }
export interface StrategyLog { shows: ShowRecord[]; planned: number; noCard: number; noVenue: number; signed: number; seen: Set<string>; /** Planning is skipped until this day after a failed attempt (keeps the audit fast; a human would also wait). */ why: Record<string, number>; coolUntil: number; /** Downshifted to conservative play after a failed attempt or a cash scare (a human would too); cleared once cash has recovered. */ recover: boolean; /** The high-risk strategy has placed its bet (reached its stake). */ bet: boolean; betDay: number | null }
export const newLog = (): StrategyLog => ({ shows: [], planned: 0, noCard: 0, noVenue: 0, signed: 0, seen: new Set(), why: {}, coolUntil: 0, recover: false, bet: false, betDay: null })

/**
 * What one fighter's purse may cost for a promotion of this size: roughly £11 per seat of the biggest building it may book
 * (a headliner above this cannot be paid back by the gate of any show the promotion is allowed to stage). Bold strategies stretch it.
 */
function purseCap(s: GameState, st: Strategy): number {
  const cap = TIER_DEFS[s.promotions[s.playerPromotionId].tier].maxCapacity
  const stretch = st.sign === 'stars' ? 2.2 : st.sign === 'solid' ? 1.1 : 1
  return Math.min(cap, 60_000) * 11 * stretch
}

function agreeOne(s: GameState, myId: Id, taken: Set<Id>, st: Strategy): { state: GameState; fightId: Id } | null {
  let cands = opponentCandidates(s, myId, {}).filter((x) => x.canApproach && !taken.has(x.view.id))
  const mine = s.fighters[myId]
  if (st.opponents === 'cheap') cands.sort((a, b) => a.view.reputation - b.view.reputation)
  else if (st.opponents === 'big') cands.sort((a, b) => b.view.reputation + b.view.popularity - (a.view.reputation + a.view.popularity))
  else cands.sort((a, b) => Math.abs(a.view.reputation - mine.reputation) - Math.abs(b.view.reputation - mine.reputation))
  if (st.opponents === 'big') cands = cands.slice(0, 12)
  const cash = s.promotions[s.playerPromotionId].cash
  for (const c of cands.slice(0, 6)) {
    const ap = approach(s, myId, c.view.id)
    if (!ap.ok) continue
    let state = ap.state
    const fightId = ap.fightId!
    for (let i = 0; i < 5; i++) {
      const base = suggestedFightOffer(state, c.view.id)
      if (base.purseB > cash * 0.2) break // cannot afford this opponent
      const offer: FightOffer = { ...base, purseB: base.purseB * (1 + i * 0.3), winBonusB: base.winBonusB }
      const out = offerFight(state, fightId, offer)
      if (!out.ok) break
      state = out.state
      const status = state.fights[fightId].status
      if (status === 'agreed') { taken.add(c.view.id); return { state, fightId } }
      if (status === 'cancelled') break
    }
  }
  return null
}

function manageRoster(input: GameState, st: Strategy, log: StrategyLog): GameState {
  let s = input
  const cash = () => s.promotions[s.playerPromotionId].cash
  const free = () => Math.max(0, cash() - weeklyBurn(s).total * 26)
  // Renewals of fighters worth keeping.
  for (const f of playerRoster(s)) {
    const c = s.contracts[f.contractId!]
    if (!c || c.endDay - s.today > 26 * 7 || f.reputation < 10) continue
    const base = suggestedOffer(s, f, 'renewal')
    if (base.signingBonus + base.basePurse * 2 > free() * 0.3 && st.sign !== 'stars') continue
    if (base.basePurse > purseCap(s, st)) continue // a smart promoter lets a fighter walk rather than pay more than the gate can bear
    for (const k of [1, 1.15, 1.35, 1.6]) {
      const out = makeOffer(s, f.id, { ...base, basePurse: base.basePurse * k, weeklyRetainer: base.weeklyRetainer * k, signingBonus: base.signingBonus * k }, 'renewal')
      if (!out.ok) break
      s = out.state
      if (s.fighters[f.id].contractId !== f.contractId) break
    }
  }
  const roster = playerRoster(s)
  const desperate = roster.length < 4 && cash() > 0
  if (!desperate && (roster.length >= st.rosterTarget || free() < st.signCashFloor * 0.4 || Math.floor(s.today / 7) % 3 !== 0)) return s
  const mode = desperate ? 'cheap' : st.sign === 'stars' && cash() < st.investAbove ? 'solid' : st.sign
  let pool = viewsOf(s).freeAgents().filter((v) => v.status === 'active' && v.age < 36)
  if (mode === 'cheap') pool = pool.filter((v) => v.age <= 31 && v.reputation >= 10).sort((a, b) => a.reputation - b.reputation).slice(0, 12)
  else if (mode === 'prospects') pool = pool.filter((v) => v.age <= 23).sort((a, b) => b.ceiling.mid - a.ceiling.mid).slice(0, 12)
  else if (mode === 'stars') pool = pool.sort((a, b) => b.popularity + b.reputation - (a.popularity + a.reputation)).slice(0, 6)
  else pool = pool.sort((a, b) => b.reputation + b.popularity - (a.reputation + a.popularity)).slice(0, 10)
  for (const v of pool) {
    const f = s.fighters[v.id]
    const base = suggestedOffer(s, f, 'signing')
    if (base.basePurse > purseCap(s, st)) continue
    const outlay = base.signingBonus + base.basePurse * 2
    if (desperate ? outlay > cash() * 0.3 : outlay + base.weeklyRetainer * 52 > free() * st.signShare * 2) continue
    for (const k of [1, 1.2, 1.5]) {
      const out = makeOffer(s, f.id, { ...base, basePurse: base.basePurse * k, weeklyRetainer: base.weeklyRetainer * k, signingBonus: base.signingBonus * k }, 'signing')
      if (!out.ok) break
      s = out.state
      if (s.fighters[f.id].contractId) { log.signed++; return s }
    }
  }
  return s
}

/** Sponsors: every scripted promoter takes the best offer it is allowed (longer deals for the bolder strategies). */
function handleSponsors(input: GameState, st: Strategy): GameState {
  let s = input
  const offers = s.sponsors?.offers ?? []
  if (offers.length === 0) return s
  const years: 1 | 2 | 3 = st.name.startsWith('A') || st.name.startsWith('E') ? 2 : 3
  for (const o of offers.slice().sort((a, b) => b.annual - a.annual)) {
    if (activeDeals(s).length >= 5) break
    const r = acceptSponsorOffer(s, o.id, years)
    if (r.ok) s = r.state
  }
  return s
}

function recordShows(s: GameState, log: StrategyLog): void {
  for (const ev of Object.values(s.events)) {
    if (ev.promotionId !== s.playerPromotionId || !ev.result || log.seen.has(ev.id)) continue
    log.seen.add(ev.id)
    const v = s.venues[ev.venueId]
    const fights = ev.card.map((id) => s.fights[id]).filter(Boolean)
    const main = fights[fights.length - 1]
    log.shows.push({
      day: ev.day, tier: v.tier, venue: v.name, fights: ev.card.length, attendance: ev.result.attendance, capacity: v.capacity, revenue: ev.result.revenue, costs: ev.result.costs, profit: ev.result.profit,
      ppv: ev.finance.revenue.ppv, broadcast: ev.broadcast.kind, sponsor: ev.finance.revenue.sponsorship, tickets: ev.finance.revenue.tickets, purses: ev.finance.costs.purses + ev.finance.costs.bonuses,
      forecastAtt: ev.forecast?.att, priceGa: ev.prices.ga, mainAppeal: main ? Math.round(ev.result.cardQuality) : 0,
    })
  }
}

/** One week of management. Returns the new state (call advanceOneWeek afterwards). */
export function playWeek(input: GameState, st0: Strategy, log: StrategyLog): GameState {
  // Betting strategies build a stake first (they play like the conservative promoter), then commit.
  if (st0.investAbove > 0 && !log.bet && input.promotions[input.playerPromotionId].cash >= st0.investAbove && TIER_DEFS[input.promotions[input.playerPromotionId].tier].rank >= TIER_DEFS[st0.betTier].rank) { log.bet = true; log.betDay = input.today }
  const cash0 = input.promotions[input.playerPromotionId].cash
  if (log.recover && cash0 >= Math.max(3 * st0.cashFloor, 250_000)) log.recover = false
  if (!log.recover && cash0 < st0.cashFloor * 1.5) log.recover = true
  const st: Strategy = log.recover || (st0.investAbove > 0 && !log.bet) ? { ...STRATEGIES.conservative, name: st0.name, cashFloor: 15_000, signCashFloor: st0.signCashFloor } : st0
  let s = manageRoster(input, st, log)
  s = handleSponsors(s, st)
  for (const ev of Object.values(s.events)) if (ev.promotionId === s.playerPromotionId && (ev.status === 'fightWeek' || ev.status === 'live')) s = runEventToEnd(s, ev.id).state
  recordShows(s, log)
  const open = playerOpenEvents(s)
  const cashNow = s.promotions[s.playerPromotionId].cash
  const cash = Math.max(0, cashNow - weeklyBurn(s).total * 8)
  if (open.length >= st.maxConcurrent || cashNow < st.cashFloor || s.today < log.coolUntil) return s
  const roster = playerRoster(s).filter((f) => !f.activeFightId && !f.injury && f.status === 'active')
  if (roster.length < Math.min(st.cardMin, 3)) return s

  const taken = new Set<Id>()
  const agreed: Id[] = []
  let state = s
  const order = st.sign === 'stars' && cashNow >= st.investAbove ? roster.sort((a, b) => b.popularity - a.popularity) : roster
  for (const f of order.slice(0, st.cardMax)) {
    if (state.fighters[f.id].activeFightId) continue
    const a = agreeOne(state, f.id, taken, st)
    if (a) { state = a.state; agreed.push(a.fightId) }
  }
  if (agreed.length < st.cardMin) { log.noCard++; log.coolUntil = s.today + 21; log.recover = true; return s }

  const day = state.today + 5 + 7 * (st.lead - 1)
  const evaluate = (ids: Id[], relax: boolean) => {
    const fights = ids.map((id) => state.fights[id])
    const out: { v: Venue; mid: number; cap: number; fill: number; pm: number }[] = []
    for (const v of Object.values(state.venues)) {
      const maxTier = relax ? 'regional' : st.maxTier
      const rej = (k: string) => { log.why[k] = (log.why[k] ?? 0) + 1 }
      if (!tierAllowsVenue(state.promotions[state.playerPromotionId].tier, v)) { rej('tier'); continue }
      if (TIERS.indexOf(v.tier) > TIERS.indexOf(maxTier)) { rej('maxTier'); continue }
      if (v.minFights > ids.length || v.maxFights < ids.length) { rej('cardSize'); continue }
      if (hireFor(state, v, state.playerPromotionId) > cash * (relax ? 0.15 : st.hireShare)) { rej('hire'); continue }
      if (venueBookedOn(state, v.id, day)) { rej('booked'); continue }
      const ev = draftEvent(state, state.promotions[state.playerPromotionId], fights, v, day)
      ev.kind = 'player'
      const ref = refPrices(eventInterest(state, ev))
      ev.marketing = { level: st.marketing[v.tier], strategy: st.promo, budget: 2_000, spent: 0 }
      let bestPm = st.priceMult, bestF: ReturnType<typeof forecastEvent> | null = null
      for (const m of st.priceSearch ? [1, 1.25, 1.5, 1.8, 2.2] : [st.priceMult]) {
        ev.prices = { ga: Math.max(8, Math.round(ref.ga * m)), premium: Math.round(ref.premium * m), vip: Math.round(ref.vip * m) }
        const fm = forecastEvent(state, ev)
        if (!bestF || fm.profit.lo + fm.profit.hi > bestF.profit.lo + bestF.profit.hi) { bestF = fm; bestPm = m }
      }
      const f = bestF!
      if (!relax && f.profit.lo < -st.maxLossShare * cashNow) { rej('loss'); continue }
      out.push({ v, mid: (f.profit.lo + f.profit.hi) / 2, cap: v.capacity, fill: (f.fill.lo + f.fill.hi) / 2, pm: bestPm })
    }
    return out
  }
  // Card size is a decision: add fights only while the best forecast keeps improving (undercard purses cost real money).
  const pickFrom = (opts: ReturnType<typeof evaluate>, relaxed: boolean) => {
    if (opts.length === 0) return null
    if (relaxed || st.venuePick === 'forecast') return opts.slice().sort((a, b) => b.mid - a.mid)[0]
    if (st.venuePick === 'ambitious') { const ok = opts.filter((o) => o.fill >= st.minFill).sort((a, b) => b.cap - a.cap); return ok[0] ?? opts.slice().sort((a, b) => b.mid - a.mid)[0] }
    return opts.slice().sort((a, b) => a.v.hireCost - b.v.hireCost)[0]
  }
  let best: { n: number; pick: NonNullable<ReturnType<typeof pickFrom>>; score: number; relaxed: boolean } | null = null
  for (const relaxed of [false, true]) {
    for (let n = agreed.length; n >= st.cardMin; n--) {
      const opts = evaluate(agreed.slice(0, n), relaxed).filter((o) => !relaxed || o.mid > -0.03 * cashNow)
      const pick = pickFrom(opts, relaxed)
      if (!pick) continue
      const score = st.venuePick === 'ambitious' && !relaxed ? pick.cap : pick.mid
      if (!best || score > best.score) best = { n, pick, score, relaxed }
    }
    if (best) break
  }
  if (!best) { log.noVenue++; log.coolUntil = s.today + 14; log.recover = true; return s }
  // Release the fights that did not make the card.
  for (const id of agreed.slice(best.n)) { const w = withdraw(state, id); if (w.ok) state = w.state }
  agreed.length = best.n
  const pick = best.pick
  const tierOf = pick.v.tier

  const made = createEvent(state, { name: `Show ${log.planned + 1}`, day, venueId: pick.v.id })
  if (!made.ok) { log.noVenue++; if (process.env.DBG) console.log('createEvent failed:', made.error); return s }
  state = made.state
  const eid = made.eventId!
  for (const id of agreed) state = addFightToEvent(state, eid, id).state
  log.planned++
  const base = refPrices(eventInterest(state, state.events[eid]))
  const pm = pick.pm
  state = setEventPrices(state, eid, { ga: Math.max(8, Math.round(base.ga * pm)), premium: Math.round(base.premium * pm), vip: Math.round(base.vip * pm) }).state
  state = setEventMarketing(state, eid, { level: st.marketing[tierOf], strategy: st.promo }).state
  // Broadcast: best guaranteed net among allowed, PPV when the main event is a real draw.
  const q = cardQuality(state, state.events[eid])
  let bk: BroadcastKind = 'none', bnet = 0
  for (const k of st.broadcast) {
    if (k === 'none') continue
    const t = broadcastTerms(state, state.events[eid], k, 'public')
    if (!t.available) continue
    if (k === 'ppv') { if (q.main >= st.ppvMinMainAppeal) { bk = 'ppv'; break } continue }
    if (t.fee - t.production > bnet) { bk = k; bnet = t.fee - t.production }
  }
  if (bk !== 'none') state = setEventBroadcast(state, eid, bk).state
  const put = putEventOnSale(state, eid)
  if (!put.ok) return s
  state = put.state
  const offers = state.events[eid].sponsor.offers.slice().sort((a, b) => b.fixedFee - a.fixedFee)
  if (offers[0]) state = chooseSponsor(state, eid, offers[0].id).state
  return state
}
