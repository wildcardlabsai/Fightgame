/**
 * PROMOTER ADVISOR (Phase 4.7) — pure, read-only advice derived from state the player can legitimately see.
 *
 * Rules of the road:
 *  - It never changes state, RNG, prices, fighter behaviour or any financial rule. It only describes.
 *  - It reads PUBLIC information only: the event forecast (public mode), the player's own contracts and books,
 *    and the leak-safe `FighterView`. It never touches hidden attributes, potential, personality or the real demand.
 *  - It never blocks anything: every warning ends in "Proceed anyway" at the call site.
 */
import { totalCosts } from './eventFinance'
import { cardFights, forecastEvent, type Forecast } from './events/demand'
import { BALANCE } from './balance'
import type { Assessment } from './matchmaking'
import { offerSummaryOf } from './negotiation'
import { hireFor, productionCost } from './events/demand'
import { sponsorView } from './sponsors'
import { tierAllowsVenue, TIER_DEFS, tierDef, playerRosterCap } from './tiers'
import { tierStatus } from './tierProgress'
import { cashRunwayWeeks, eventCommitments, financialHealth, player, weeklyBurn } from './selectors'
import type { BoxingEvent, GameState, Id, Offer } from './types'
import { viewsOf, type FighterView } from './view'
import { pathwayText } from './business/commitments'
import { fightStakes, planWarning } from './business/fightTalks'
import { planFit } from './business/plans'
import { levelRank } from './business/titleDefs'
import { titleOpportunities } from './business/titleEco'
import { expectedContractTerms, expectedFightTerms } from './business/terms'

export type AdviceLevel = 'info' | 'tip' | 'caution' | 'highRisk' | 'critical'
export type AdvisorMode = 'full' | 'standard' | 'minimal' | 'off'
export type AdviceTopic = 'finance' | 'event' | 'contract' | 'fighter' | 'matchmaking' | 'roster' | 'growth' | 'sponsor' | 'titles'

export const LEVEL_RANK: Record<AdviceLevel, number> = { info: 0, tip: 1, caution: 2, highRisk: 3, critical: 4 }
export const LEVEL_LABEL: Record<AdviceLevel, string> = { info: 'INFO', tip: 'TIP', caution: 'CAUTION', highRisk: 'HIGH RISK', critical: 'CRITICAL' }
export const ADVISOR_MODES: AdvisorMode[] = ['full', 'standard', 'minimal', 'off']
export const DEFAULT_ADVISOR_MODE: AdvisorMode = 'standard'

export interface AdviceFact { label: string; money?: number; text?: string; tone?: 'good' | 'bad' }
export interface Advice {
  /** Stable across weeks for the same situation (React keys, tests). */
  id: string
  level: AdviceLevel
  topic: AdviceTopic
  title: string
  body: string
  facts?: AdviceFact[]
  link?: { kind: 'fighter'; id: string } | { kind: 'screen'; screen: string } | { kind: 'event'; id: string }
  actionLabel?: string
}

const TOPIC_RANK: Record<AdviceTopic, number> = { finance: 0, event: 1, contract: 2, titles: 3, roster: 4, sponsor: 5, fighter: 6, matchmaking: 7, growth: 8 }

/** Most serious first; finance before other topics at the same level; id keeps the order deterministic. */
export function sortAdvice(list: Advice[]): Advice[] {
  return list.slice().sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || TOPIC_RANK[a.topic] - TOPIC_RANK[b.topic] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * What the player's advisor setting lets through.
 *  full: everything · standard: cautions and above + at most one tip · minimal: only high-risk/critical · off: nothing.
 */
export function visibleAdvice(list: Advice[], mode: AdvisorMode, cap = 4): Advice[] {
  if (mode === 'off') return []
  const sorted = sortAdvice(list)
  if (mode === 'minimal') return sorted.filter((a) => LEVEL_RANK[a.level] >= LEVEL_RANK.highRisk).slice(0, cap)
  if (mode === 'full') return sorted.slice(0, cap)
  const serious = sorted.filter((a) => LEVEL_RANK[a.level] >= LEVEL_RANK.caution)
  const tip = sorted.find((a) => LEVEL_RANK[a.level] < LEVEL_RANK.caution)
  const out = serious.slice(0, cap)
  if (tip && out.length < cap && out.length < 3) out.push(tip)
  return out
}

/** Does this advice warrant a "Proceed anyway?" confirmation? */
export function needsConfirmation(a: Advice | null | undefined): boolean {
  return !!a && LEVEL_RANK[a.level] >= LEVEL_RANK.highRisk
}

const INSOLVENT = BALANCE.events.health.insolventCash

// ------------------------------------------------------------------ Events

export interface EventRisk {
  cash: number
  /** What the show will cost in total (mid estimate) and what is still to be paid. */
  projectedCost: number
  remainingCost: number
  expectedRevenue: number
  worstRevenue: number
  expectedProfit: number
  worstProfit: number
  expectedCash: number
  worstCash: number
  level: AdviceLevel
}

function eventRisk(state: GameState, ev: BoxingEvent, f: Forecast): EventRisk {
  const cash = player(state).cash
  const paid = totalCosts(ev.finance)
  const costMid = (f.costs.lo + f.costs.hi) / 2
  const revMid = (f.revenue.lo + f.revenue.hi) / 2
  const projectedCost = Math.round(costMid)
  const remainingCost = Math.max(0, Math.round(costMid - paid))
  const expectedCash = Math.round(cash - Math.max(0, costMid - paid) + revMid)
  const worstCash = Math.round(cash - Math.max(0, f.costs.hi - paid) + f.revenue.lo)
  const expectedProfit = Math.round(revMid - costMid)
  const worstProfit = Math.round(f.profit.lo)
  let level: AdviceLevel = 'info'
  if (worstCash < INSOLVENT) level = 'critical'
  else if (worstCash < 0 || remainingCost > cash || expectedCash < 0 || -worstProfit > 0.6 * Math.max(cash, 1)) level = 'highRisk'
  else if (expectedProfit < 0 || -worstProfit > 0.25 * Math.max(cash, 1)) level = 'caution'
  return { cash: Math.round(cash), projectedCost, remainingCost, expectedRevenue: Math.round(revMid), worstRevenue: Math.round(f.revenue.lo), expectedProfit, worstProfit, expectedCash, worstCash, level }
}

/** The financial picture of one of the player's open shows — safe to show before putting it on sale. */
export function eventRiskOf(state: GameState, eventId: Id): EventRisk | null {
  const ev = state.events[eventId]
  if (!ev || ev.promotionId !== state.playerPromotionId) return null
  return eventRisk(state, ev, forecastEvent(state, ev))
}

export function eventAdvice(state: GameState, eventId: Id): Advice[] {
  const ev = state.events[eventId]
  if (!ev || ev.promotionId !== state.playerPromotionId || !['venueBooked', 'cardBuilding', 'onSale', 'promoting'].includes(ev.status)) return []
  const fights = cardFights(state, ev)
  if (fights.length === 0) return []
  const f = forecastEvent(state, ev)
  const r = eventRisk(state, ev, f)
  const out: Advice[] = []
  const facts: AdviceFact[] = [
    { label: 'Current cash', money: r.cash },
    { label: 'Projected event cost', money: r.projectedCost },
    { label: 'Expected revenue', money: r.expectedRevenue },
    { label: 'Worst-case revenue', money: r.worstRevenue },
    { label: 'Expected profit / loss', money: r.expectedProfit, tone: r.expectedProfit >= 0 ? 'good' : 'bad' },
    { label: 'Cash after (expected)', money: r.expectedCash, tone: r.expectedCash >= 0 ? undefined : 'bad' },
    { label: 'Cash after (worst case)', money: r.worstCash, tone: r.worstCash >= 0 ? undefined : 'bad' },
  ]
  const link = { kind: 'event' as const, id: ev.id }
  if (r.level === 'critical') {
    out.push({ id: `event-${ev.id}-cash`, level: 'critical', topic: 'event', title: 'This event could leave the promotion insolvent', body: r.remainingCost > r.cash ? 'The bills for this show are larger than the cash you have. If ticket sales fall short, there is no cushion.' : 'If the crowd is at the low end of the forecast, the loss would push you past the insolvency line.', facts, link, actionLabel: 'Review event' })
  } else if (r.level === 'highRisk') {
    out.push({ id: `event-${ev.id}-cash`, level: 'highRisk', topic: 'event', title: 'High financial risk', body: r.remainingCost > r.cash ? 'Show costs exceed the cash you hold right now. You are relying on ticket sales and sponsors arriving in time.' : 'A weak night could cost a large share of your remaining cash.', facts, link, actionLabel: 'Review event' })
  } else if (r.level === 'caution') {
    out.push({ id: `event-${ev.id}-cash`, level: 'caution', topic: 'event', title: r.expectedProfit < 0 ? 'This show is expected to lose money' : 'A poor night would hurt', body: r.expectedProfit < 0 ? 'On the public forecast the show costs more than it earns. Smaller venue, cheaper purses or better pricing could help.' : 'It should profit, but the low end of the forecast would cost a meaningful share of your cash.', facts, link, actionLabel: 'Review event' })
  }
  if (ev.broadcast.kind === 'ppv' && (f.ppvBuys.hi < 4000 || r.expectedProfit < 0)) {
    out.push({ id: `event-${ev.id}-ppv`, level: r.expectedProfit < 0 ? 'caution' : 'tip', topic: 'event', title: 'Pay-per-view is a gamble on this card', body: 'PPV production is expensive and only star main events reliably cover it. A flop here would be costly.', link, actionLabel: 'Review event' })
  }
  const v = state.venues[ev.venueId]
  if (f.attendance.hi < v.capacity * 0.3) out.push({ id: `event-${ev.id}-big`, level: 'caution', topic: 'event', title: 'The venue looks too big for this card', body: `Even the optimistic forecast fills under a third of ${v.name}. An empty hall wastes money and kills the atmosphere.`, link, actionLabel: 'Review venues' })
  else if (f.attendance.lo > v.capacity * 0.95) out.push({ id: `event-${ev.id}-sellout`, level: 'tip', topic: 'growth', title: 'Demand looks strong enough for a bigger venue', body: 'You should sell out even on a soft night. A larger hall (or higher prices) could earn more next time.', link })
  if (ev.marketing.budget > 0.25 * Math.max(r.cash, 1) && r.cash > 0) out.push({ id: `event-${ev.id}-mkt`, level: 'tip', topic: 'event', title: 'Marketing is a big slice of your cash', body: 'Marketing helps awareness but the return is uncertain. Make sure the card can pay it back.', link })
  return out
}

/** Booking a venue commits hire + staging before a single ticket is sold — warn if that alone is heavy. */
export function venueBookingAdvice(state: GameState, hireCost: number, productionCost: number, venueName: string): Advice | null {
  const cash = player(state).cash
  const base = hireCost + productionCost
  if (base <= 0) return null
  const share = base / Math.max(cash, 1)
  if (cash - base < INSOLVENT) return { id: `book-${venueName}`, level: 'critical', topic: 'event', title: 'Hire and staging alone could leave you insolvent', body: `Before a single purse is paid, ${venueName} costs more than your cash can cover.`, facts: [{ label: 'Current cash', money: Math.round(cash) }, { label: 'Hire + staging', money: Math.round(base) }] }
  if (share > 0.6) return { id: `book-${venueName}`, level: 'highRisk', topic: 'event', title: 'A very large bill for your bank balance', body: 'Venue hire and staging take most of your cash before purses and marketing are added.', facts: [{ label: 'Current cash', money: Math.round(cash) }, { label: 'Hire + staging', money: Math.round(base) }] }
  if (share > 0.3) return { id: `book-${venueName}`, level: 'caution', topic: 'event', title: 'Sizeable venue cost', body: 'Hire and staging are already a large share of your cash. Make sure the card will fill it.', facts: [{ label: 'Current cash', money: Math.round(cash) }, { label: 'Hire + staging', money: Math.round(base) }] }
  return null
}

// --------------------------------------------------------------- Contracts

/** Annual guaranteed cost the player already carries for fighters (retainers + guaranteed purses). */
export function annualFighterCost(state: GameState): number {
  let n = 0
  for (const c of Object.values(state.contracts)) {
    if (c.promotionId !== state.playerPromotionId) continue
    n += c.weeklyRetainer * 52 + c.basePurse * c.minFightsPerYear
  }
  return Math.round(n)
}

export interface ContractCheck { annual: number; marketAnnualLo: number; marketAnnualHi: number; overMarketPct: number; addedShare: number; runwayAfter: number | null; cashAfter: number }

export function contractCheck(state: GameState, fighterId: Id, offer: Offer): ContractCheck | null {
  const v = viewsOf(state).fighter(fighterId)
  if (!v) return null
  const sum = offerSummaryOf(offer)
  const fpy = Math.max(1, offer.fights / Math.max(1, offer.years))
  const annual = offer.weeklyRetainer * 52 + offer.basePurse * fpy + offer.signingBonus / Math.max(1, offer.years)
  const b = v.market.askBand
  const marketAnnualLo = b.retainerLo * 52 + b.purseLo * fpy + b.signingLo / Math.max(1, offer.years)
  const marketAnnualHi = b.retainerHi * 52 + b.purseHi * fpy + b.signingHi / Math.max(1, offer.years)
  const base = annualFighterCost(state)
  const own = v.contract.kind === 'own' ? v.contract.contract : null
  const added = Math.max(0, annual - (own ? own.weeklyRetainer * 52 + own.basePurse * own.minFightsPerYear : 0))
  const cash = player(state).cash
  const burn = weeklyBurn(state).total + (own ? 0 : sum.weeklyCost)
  const cashAfter = cash - offer.signingBonus
  return {
    annual: Math.round(annual), marketAnnualLo: Math.round(marketAnnualLo), marketAnnualHi: Math.round(marketAnnualHi),
    overMarketPct: marketAnnualHi > 0 ? annual / marketAnnualHi - 1 : 0,
    addedShare: added / Math.max(base, 1), runwayAfter: burn > 0 ? Math.floor(Math.max(0, cashAfter) / burn) : null, cashAfter: Math.round(cashAfter),
  }
}

export function contractAdvice(state: GameState, fighterId: Id, offer: Offer): Advice[] {
  const c = contractCheck(state, fighterId, offer)
  const v = viewsOf(state).fighter(fighterId)
  if (!c || !v) return []
  const cash = player(state).cash
  const out: Advice[] = []
  const id = `contract-${fighterId}`
  const facts: AdviceFact[] = [
    { label: 'Offer, per year', money: c.annual }, { label: 'Market estimate, per year', text: `£${Math.round(c.marketAnnualLo / 1000)}k–£${Math.round(c.marketAnnualHi / 1000)}k` },
    { label: 'Cash after signing bonus', money: c.cashAfter, tone: c.cashAfter < 0 ? 'bad' : undefined },
  ]
  const pct = Math.round(c.overMarketPct * 100)
  if (c.runwayAfter !== null && c.runwayAfter < 8 || c.cashAfter < INSOLVENT) {
    out.push({ id: `${id}-fin`, level: 'critical', topic: 'contract', title: 'This signing could cause insolvency', body: 'After the signing bonus you would have almost no running-cost runway left.', facts })
  } else if (c.addedShare > 0.4 && c.annual > 0.15 * Math.max(cash, 1)) {
    out.push({ id: `${id}-fin`, level: 'highRisk', topic: 'contract', title: 'Financial warning', body: `This contract could raise your annual fighter costs by about ${Math.round(c.addedShare * 100)}%.`, facts })
  } else if (c.overMarketPct > 0.25) {
    out.push({ id: `${id}-price`, level: 'caution', topic: 'contract', title: 'Contract warning', body: `This offer is roughly ${pct}% above the estimated market range.`, facts })
  } else if (c.overMarketPct > 0.05) {
    out.push({ id: `${id}-price`, level: 'tip', topic: 'contract', title: 'Contract tip', body: 'This offer is above the current market estimate. You may be paying a premium to secure this fighter.', facts })
  }
  if (offer.years >= 3 && v.age <= 25 && (v.momentumLabel === 'Surging' || v.momentumLabel === 'Rising' || v.ceiling.mid >= 60) && c.overMarketPct <= 0.25) {
    out.push({ id: `${id}-long`, level: 'tip', topic: 'contract', title: 'A longer deal can protect a rising talent', body: 'Locking a young fighter in now keeps the price fixed while their reputation grows.' })
  }
  if (offer.years === 1 && v.age <= 25 && v.momentumLabel !== 'Slipping' && v.momentumLabel !== 'Struggling') {
    out.push({ id: `${id}-short`, level: 'tip', topic: 'contract', title: 'Short deals can cost you the fighter', body: 'If they develop, a rival can sign them as soon as this one ends. Consider a longer term.' })
  }
  return out
}

// ----------------------------------------------------------------- Fighters

/** Public-information tips for one fighter. */
export function fighterAdvice(v: FighterView): Advice[] {
  const out: Advice[] = []
  const id = `fighter-${v.id}`
  const link = { kind: 'fighter' as const, id: v.id }
  const scouted = v.knowledge.reports > 0 || !!v.own
  if (v.status === 'retired') return out
  if (v.age <= 23 && v.ceiling.mid >= 62 && scouted) out.push({ id: `${id}-upside`, level: 'tip', topic: 'fighter', title: 'Promoter tip', body: 'This fighter is young and has significant upside according to your scouting reports.', link })
  else if (v.age <= 23 && !scouted) out.push({ id: `${id}-unscouted`, level: 'info', topic: 'fighter', title: 'Promoter tip', body: 'This fighter is young but you have no scouting report yet. A report would show how much upside there really is.', link })
  if (v.contract.kind !== 'own' && v.market.signable && v.popularity <= 25) out.push({ id: `${id}-cheap`, level: 'tip', topic: 'fighter', title: 'Market tip', body: 'This fighter’s current popularity is low, so they may be inexpensive to sign.', link })
  if (v.contract.kind === 'own' && (v.momentumLabel === 'Surging' || v.momentumLabel === 'Rising') && v.contract.weeksLeft > 30 && v.contract.contract.fightsRemaining > 0) {
    out.push({ id: `${id}-rising`, level: 'tip', topic: 'fighter', title: 'Contract tip', body: 'This fighter’s reputation is rising quickly. Consider whether a longer contract could protect your investment.', link })
  }
  if (v.contract.kind === 'own') {
    const cv = v.contract.contract
    const askHi = v.market.askBand.purseHi
    if (askHi > cv.basePurse * 1.6 && v.contract.weeksLeft <= 52) out.push({ id: `${id}-expensive`, level: 'caution', topic: 'fighter', title: 'Becoming expensive', body: 'This fighter is now worth well above their current deal. Expect a much bigger ask at renewal.', link })
  }
  return out
}

// ------------------------------------------------------------- Matchmaking

export function matchmakingAdvice(me: FighterView, opp: FighterView, a: Assessment): Advice[] {
  const out: Advice[] = []
  const id = `match-${me.id}-${opp.id}`
  const gap = opp.reputation - me.reputation
  if (a.confidence === 'Low') out.push({ id: `${id}-scout`, level: 'caution', topic: 'matchmaking', title: 'Scouting warning', body: 'Your confidence in this opponent assessment is low. Consider commissioning a deeper scouting report.' })
  if (a.verdict === 'High risk' && a.winHi < 45) out.push({ id: `${id}-risk`, level: 'caution', topic: 'matchmaking', title: 'Matchmaking tip', body: me.age <= 24 ? 'This is a high-risk fight for a young fighter. A loss here could hurt their reputation.' : 'This is a high-risk fight on your current estimates.' })
  else if (gap >= 12) out.push({ id: `${id}-step`, level: 'tip', topic: 'matchmaking', title: 'Matchmaking tip', body: 'This opponent represents a significant step up in competition.' })
  if (a.reward >= 4 && a.winLo >= 40) out.push({ id: `${id}-career`, level: 'tip', topic: 'matchmaking', title: 'Career tip', body: 'A win here could significantly improve this fighter’s reputation.' })
  if (a.koRisk === 'High') out.push({ id: `${id}-ko`, level: 'caution', topic: 'matchmaking', title: 'Knockout risk', body: 'Your scouts see a real chance of a stoppage loss. Those hurt a fighter’s standing and confidence.' })
  return out
}

// ------------------------------------------------------------------ Roster

export function rosterAdvice(state: GameState): Advice[] {
  const out: Advice[] = []
  for (const v of viewsOf(state).mine()) {
    if (v.status === 'retired' || v.contract.kind !== 'own') continue
    const link = { kind: 'fighter' as const, id: v.id }
    const w = v.contract.weeksLeft
    if (w <= 16) out.push({ id: `roster-${v.id}-expiry`, level: 'caution', topic: 'roster', title: 'Contract', body: `${v.name}’s contract expires in ${w <= 0 ? 'under a week' : `${w} week${w === 1 ? '' : 's'}`}.`, link, actionLabel: 'Renew' })
    else if (w <= 30) out.push({ id: `roster-${v.id}-expiry`, level: 'info', topic: 'roster', title: 'Contract', body: `${v.name}’s contract has about ${Math.round(w / 4.33)} months left.`, link })
    const since = v.lastFightWeeksAgo
    // New arrivals get a few weeks' grace: they were idle before they joined, not because of you.
    const settled = Math.floor((state.today - v.contract.contract.startDay) / 7) >= 6
    if (settled && since !== null && since >= 26 && !v.activeFightId) out.push({ id: `roster-${v.id}-idle`, level: 'caution', topic: 'roster', title: 'Activity', body: `${v.name} has not fought in ${Math.round(since / 4.33)} months.`, link, actionLabel: 'Make a fight' })
    else if (settled && !v.activeFightId && v.availability.status === 'available' && (since === null || since >= 14)) out.push({ id: `roster-${v.id}-needs`, level: 'tip', topic: 'roster', title: 'Needs a fight', body: since === null ? `${v.name} has not fought for you yet.` : `${v.name} could use a fight soon.`, link, actionLabel: 'Matchmaking' })
    if (v.own && v.own.morale.value < 40) out.push({ id: `roster-${v.id}-morale`, level: 'caution', topic: 'roster', title: 'Morale', body: `${v.name} is unhappy. Low morale hurts development and negotiations.`, link })
    if (v.momentumLabel === 'Surging' || (v.momentumLabel === 'Rising' && v.age <= 26)) out.push({ id: `roster-${v.id}-up`, level: 'tip', topic: 'roster', title: 'Improving', body: `${v.name} is on the rise — a good time to find a bigger fight.`, link })
    if (v.momentumLabel === 'Struggling' || (v.age >= 35 && v.momentumLabel === 'Slipping')) out.push({ id: `roster-${v.id}-down`, level: 'info', topic: 'roster', title: 'Declining', body: `${v.name} has slipped recently. Protect them from a bad matchup.`, link })
    if (v.form.length >= 3 && v.form.slice(-3).every((r) => r === 'W') && v.reputation >= 30 && !v.activeFightId) out.push({ id: `roster-${v.id}-streak`, level: 'tip', topic: 'roster', title: 'Career opportunity', body: `${v.name} is on a winning run. A step-up fight could define their career.`, link, actionLabel: 'Matchmaking' })
    if (v.market.askBand.purseHi > v.contract.contract.basePurse * 1.6 && w <= 52) out.push({ id: `roster-${v.id}-pricey`, level: 'info', topic: 'roster', title: 'Becoming expensive', body: `${v.name} now outgrows their deal. Renewal will cost more.`, link })
  }
  return out
}

// ----------------------------------------------------------------- Finance

export type FinanceStanding = 'Healthy' | 'Watch spending' | 'High risk' | 'Critical'
export interface FinanceAdvisor { standing: FinanceStanding; level: AdviceLevel; reasons: string[] }

const sumRetainersOn = (state: GameState, day: number): number => {
  let n = 0
  for (const c of [...Object.values(state.contracts), ...state.contractHistory]) if (c.promotionId === state.playerPromotionId && c.startDay <= day && c.endDay > day) n += c.weeklyRetainer
  return n
}

export function financeAdvisor(state: GameState): FinanceAdvisor {
  const h = financialHealth(state)
  const reasons: string[] = []
  let standing: FinanceStanding = h.state === 'insolvent' ? 'Critical' : h.state === 'critical' ? 'High risk' : h.state === 'concern' ? 'Watch spending' : 'Healthy'
  const lift = (s: FinanceStanding) => { const order: FinanceStanding[] = ['Healthy', 'Watch spending', 'High risk', 'Critical']; if (order.indexOf(s) > order.indexOf(standing)) standing = s }
  if (h.state !== 'healthy') reasons.push(h.reason)

  // Payroll vs revenue growth over the last 12 months (only when there is a year of history to compare).
  const mine = Object.values(state.events).filter((e) => e.promotionId === state.playerPromotionId && e.result)
  if (state.today - state.startDay >= 365) {
    const nowPay = sumRetainersOn(state, state.today), thenPay = sumRetainersOn(state, state.today - 365)
    const recent = mine.filter((e) => e.day > state.today - 365), before = mine.filter((e) => e.day <= state.today - 365 && e.day > state.today - 730)
    const avg = (xs: BoxingEvent[]) => (xs.length ? xs.reduce((n, e) => n + e.result!.revenue, 0) / xs.length : 0)
    if (thenPay > 0 && nowPay > thenPay * 1.1) {
      const payUp = Math.round((nowPay / thenPay - 1) * 100)
      if (before.length > 0 && recent.length > 0) {
        const revUp = Math.round((avg(recent) / Math.max(1, avg(before)) - 1) * 100)
        if (revUp < payUp - 5) { reasons.push(`Your fighter payroll has increased ${payUp}% over the last 12 months while average event revenue has ${revUp >= 0 ? `only increased ${revUp}%` : `fallen ${-revUp}%`}.`); lift('Watch spending') }
      } else { reasons.push(`Your fighter payroll has increased ${payUp}% over the last 12 months, but you have little recent event revenue to match it.`); lift('Watch spending') }
    }
    if (recent.length >= 2) {
      const profit = recent.reduce((n, e) => n + e.result!.profit, 0)
      if (profit < 0) { reasons.push(`Your shows have lost ${Math.round(-profit / 1000)}k over the last 12 months.`); lift('Watch spending') }
    }
  }
  const burn = weeklyBurn(state)
  if (mine.length === 0 && Object.values(state.events).every((e) => e.promotionId !== state.playerPromotionId || e.status === 'cancelled') && burn.total > 0) {
    const runway = cashRunwayWeeks(state)
    if (runway !== null && runway < 52) reasons.push('You are paying running costs with no shows booked. Events are how the promotion earns.')
  }
  const risky = Object.values(state.events).filter((e) => e.promotionId === state.playerPromotionId).flatMap((e) => eventAdvice(state, e.id)).filter((a) => a.topic === 'event' && LEVEL_RANK[a.level] >= LEVEL_RANK.highRisk)
  if (risky.length) { reasons.push('An upcoming show could cost more than you can comfortably afford.'); lift(risky.some((a) => a.level === 'critical') ? 'Critical' : 'High risk') }
  const committed = eventCommitments(state)
  if (committed > 0) reasons.push(`${Math.round(committed / 1000)}k is already committed to upcoming shows.`)
  if (reasons.length === 0) reasons.push('Comfortable cash, no pressing commitments and no risky shows booked.')
  const level: AdviceLevel = standing === 'Healthy' ? 'info' : standing === 'Watch spending' ? 'caution' : standing === 'High risk' ? 'highRisk' : 'critical'
  return { standing, level, reasons }
}

// ---------------------------------------------------------------- Dashboard

// ------------------------------------------------------- Sponsors & promotion tier

const VENUE_RANK = ['local', 'regional', 'national', 'arena', 'stadium']

export function sponsorAdvice(state: GameState): Advice[] {
  const sv = sponsorView(state)
  const out: Advice[] = []
  const link = { kind: 'screen' as const, screen: 'sponsors' }
  const cash = player(state).cash
  for (const d of sv.deals) {
    const id = `sponsor-${d.id}`
    if (d.weeksLeft <= 17) out.push({ id: `${id}-ending`, level: 'info', topic: 'sponsor', title: 'Sponsor contract', body: `Your sponsor contract with ${d.name} has ${d.weeksLeft <= 4 ? 'under a month' : `${Math.round(d.weeksLeft / 4.33)} months`} remaining.`, link, actionLabel: 'Sponsors' })
    if (d.needed > 0 && d.weeksLeftInYear > 0) {
      const pace = d.needed * 5 > d.weeksLeftInYear
      // What it costs to put on the cheapest qualifying show you may book (hire + staging; purses come on top).
      const cheapest = Math.min(...Object.values(state.venues).filter((v) => !v.legacy && VENUE_RANK.indexOf(v.tier) >= VENUE_RANK.indexOf(d.minVenue) && tierAllowsVenue(player(state).tier, v)).map((v) => hireFor(state, v, state.playerPromotionId) + productionCost(v)), Infinity)
      if (pace && Number.isFinite(cheapest) && cash < d.needed * cheapest * 1.5) out.push({ id: `${id}-cash`, level: 'highRisk', topic: 'sponsor', title: 'Sponsor commitments', body: `${d.name} needs ${d.needed} more qualifying show${d.needed === 1 ? '' : 's'} this contract year. Your current cash position may make that hard to deliver.`, link, actionLabel: 'Sponsors' })
      else if (pace) out.push({ id: `${id}-pace`, level: 'caution', topic: 'sponsor', title: 'Sponsor expectations', body: `${d.name} requires ${d.minEvents} qualifying events this contract year and you have promoted ${d.eventsThisYear}.`, link, actionLabel: 'Sponsors' })
    }
  }
  if (sv.offers.length > 0) out.push({ id: 'sponsor-offers', level: 'tip', topic: 'sponsor', title: 'Sponsor interest', body: `${sv.offers[0].name}${sv.offers.length > 1 ? ` and ${sv.offers.length - 1} other${sv.offers.length > 2 ? 's' : ''}` : ''} would like to partner with your promotion.`, link, actionLabel: 'Sponsors' })
  else if (sv.deals.length > 0 && sv.slots.used < sv.slots.max && sv.catalog.some((c) => c.status === 'available') && sv.deals.every((d) => d.annual < Math.max(...sv.catalog.filter((c) => c.status === 'available').map((c) => c.annual)) * 0.6)) {
    out.push({ id: 'sponsor-growth', level: 'tip', topic: 'growth', title: 'Bigger sponsors may be interested', body: 'Your promotion has grown enough that higher-tier sponsors may now be interested. Offers tend to arrive within a few weeks.', link, actionLabel: 'Sponsors' })
  }
  return out
}

export function tierAdvice(state: GameState): Advice[] {
  const out: Advice[] = []
  const st = tierStatus(state)
  const roster = Object.values(state.contracts).filter((c) => c.promotionId === state.playerPromotionId).length
  const cap = playerRosterCap(st.current)
  if (roster >= cap) out.push({ id: 'tier-roster-cap', level: 'info', topic: 'growth', title: 'Roster full', body: `You have ${roster} of ${cap} roster places${st.next ? `. A ${tierDef(st.next).label} promotion has room for ${TIER_DEFS[st.next].rosterCap}` : ''}.`, link: { kind: 'screen', screen: 'dashboard' } })
  if (st.next) {
    const missing = st.rows.filter((r) => !r.met)
    if (missing.length === 1) out.push({ id: 'tier-close', level: 'tip', topic: 'growth', title: `One step from ${tierDef(st.next).label}`, body: `Your promotion only needs: ${missing[0].label.toLowerCase()}.`, link: { kind: 'screen', screen: 'dashboard' } })
  }
  return out
}

// ----------------------------------------------------------- The fight business (Phase 5.4)

/**
 * Promises, title duties and opportunities. Reads only what the player can see: their own commitments and roster, the public lists,
 * the public expected-terms ranges. Never a manager's weights, an ambition the camp has not told you, or a reservation price.
 */
export function businessAdvice(state: GameState): Advice[] {
  const out: Advice[] = []
  const mine = new Set(viewsOf(state).mine().map((v) => v.id))
  for (const c of state.business?.commitments ?? []) {
    if (c.status !== 'open' || !mine.has(c.fighterId)) continue
    const f = state.fighters[c.fighterId]
    const weeks = Math.ceil((c.dueDay - state.today) / 7)
    const link = { kind: 'fighter' as const, id: f.id }
    const what = pathwayText({ kind: c.kind, weeks: 0, maxRank: c.maxRank ?? undefined })
    if (weeks <= 6) out.push({ id: `promise-${c.id}`, level: 'highRisk', topic: 'titles', title: 'A promise is about to be broken', body: `${f.firstName}’s camp was promised ${what}. ${weeks <= 0 ? 'The deadline has passed this week.' : `Only ${weeks} week${weeks === 1 ? '' : 's'} remain.`} A broken promise costs morale, trust and your reputation.`, link, actionLabel: 'Open profile' })
    else if (weeks <= 16) out.push({ id: `promise-${c.id}`, level: 'caution', topic: 'titles', title: 'Promise due', body: `${f.firstName}’s camp was promised ${what} within ${weeks} weeks. Start making the fight.`, link, actionLabel: 'Open profile' })
  }
  for (const v of viewsOf(state).mine()) {
    const f = state.fighters[v.id]
    if (!f || f.status !== 'active') continue
    for (const o of titleOpportunities(state, f)) {
      if (o.kind === 'DEFENCE_DUE' || o.kind === 'MANDATORY_SHOT') out.push({ id: `title-${o.kind}-${f.id}-${o.body}`, level: (o.dueWeeks ?? 99) <= 8 ? 'highRisk' : 'caution', topic: 'titles', title: o.kind === 'DEFENCE_DUE' ? 'Mandatory defence due' : 'Mandatory shot available', body: o.text, link: { kind: 'fighter', id: f.id }, actionLabel: 'Open profile' })
      else if (o.kind === 'ELIMINATOR') out.push({ id: `title-elim-${f.id}-${o.body}`, level: 'tip', topic: 'titles', title: 'Eliminator ordered', body: o.text, link: { kind: 'fighter', id: f.id } })
      else if ((o.kind === 'CHALLENGE' || o.kind === 'VACANT') && levelRank(o.level) >= levelRank('european') && !f.activeFightId) out.push({ id: `title-shot-${f.id}-${o.body}`, level: 'tip', topic: 'titles', title: 'A title shot is on the table', body: o.text, link: { kind: 'fighter', id: f.id } })
    }
    const amb = state.business?.learned[f.id]?.includes('ambition')
    const plan = state.business?.plans[f.id]
    if (plan && planFit(state, f, plan, !!amb).score <= -0.4) out.push({ id: `plan-${f.id}`, level: 'info', topic: 'growth', title: 'Development plan', body: `${f.firstName}’s ${plan} plan no longer suits where the career is — consider changing it.`, link: { kind: 'fighter', id: f.id } })
  }
  // Phase 5.4C: the promoter's office. Offers are time-limited; a direction is a choice the promotion has not made.
  const open = Object.values(state.office?.offers ?? {}).filter((o) => o.status === 'open')
  if (open.length > 0) {
    const soonest = Math.min(...open.map((o) => Math.ceil((o.expiresDay - state.today) / 7)))
    out.push({ id: 'offers-waiting', level: soonest <= 1 ? 'caution' : 'tip', topic: 'matchmaking', title: open.length === 1 ? 'A promoter has a fight offer for you' : `${open.length} fight offers are waiting`, body: `${soonest <= 0 ? 'One runs out this week.' : `The soonest runs out in ${soonest} week${soonest === 1 ? '' : 's'}.`} Accept, counter or decline: unanswered offers cost goodwill.`, link: { kind: 'screen', screen: 'fights/offers' }, actionLabel: 'Open offers' })
  }
  if (state.office && !state.office.strategy.focus && !state.office.strategy.stance && (state.promotions[state.playerPromotionId].stats.events ?? 0) >= 3) {
    out.push({ id: 'strategy-unset', level: 'info', topic: 'growth', title: 'Choose a direction for the promotion', body: 'You have run a few shows. Deciding what kind of promotion you are building changes what draws, what costs and what comes your way.', link: { kind: 'screen', screen: 'office' }, actionLabel: 'Promoter’s Office' })
  }
  return out.slice(0, 12)
}

/** Advice shown while making a fight (public expected terms and stakes). */
export function fightTalkAdvice(state: GameState, fightId: Id): Advice[] {
  const fight = state.fights[fightId]
  if (!fight) return []
  const out: Advice[] = []
  const st = fightStakes(state, fight)
  if (st.kind === 'eliminator') out.push({ id: `ft-${fightId}-elim`, level: 'info', topic: 'titles', title: 'Eliminator', body: 'The winner becomes the mandatory challenger for the belt. Both camps will want this fight to count.' })
  if (st.kind === 'title' || st.kind === 'unification') out.push({ id: `ft-${fightId}-title`, level: 'info', topic: 'titles', title: st.kind === 'unification' ? 'Unification fight' : 'Title fight', body: 'A belt is on the line. Expect a bigger purse and a harder negotiation.' })
  const warn = planWarning(state, fight)
  if (warn) out.push({ id: `ft-${fightId}-plan`, level: 'caution', topic: 'growth', title: 'Off plan', body: warn })
  const t = expectedFightTerms(state, fightId)
  if (t?.economics) out.push({ id: `ft-${fightId}-econ`, level: 'caution', topic: 'finance', title: 'Economics', body: t.economics })
  return out
}

/** Advice shown while making a contract offer (public ranges only). */
export function contractTalkAdvice(state: GameState, fighterId: Id, offer: Offer, kind: 'signing' | 'renewal'): Advice[] {
  const t = expectedContractTerms(state, fighterId, kind, offer)
  const f = state.fighters[fighterId]
  if (!t || !f) return []
  // The financial read on the deal (annual cost against cash and burn) stays, then the market read from the public ranges.
  const out: Advice[] = [...contractAdvice(state, fighterId, offer)]
  if (t.assessment === 'Lowball') out.push({ id: `ct-${fighterId}-low`, level: 'caution', topic: 'contract', title: 'This looks like a lowball', body: 'Against the market ranges, this offer is well short. Their camp may take offence — repeated lowballs end talks.' })
  else if (t.assessment === 'Generous offer') out.push({ id: `ct-${fighterId}-gen`, level: 'tip', topic: 'contract', title: 'A generous offer', body: 'This is above the usual range. You may be able to keep more of it.' })
  if (offer.pathway) out.push({ id: `ct-${fighterId}-path`, level: 'caution', topic: 'titles', title: 'Only promise what you can deliver', body: `${pathwayText(offer.pathway)} will be tracked. If it does not happen by the deadline, morale, trust and your reputation suffer.` })
  if (t.confidence.level === 'LOW') out.push({ id: `ct-${fighterId}-conf`, level: 'info', topic: 'contract', title: 'Low confidence', body: 'You do not know this camp yet. Ask what they are looking for before you commit.' })
  return out
}

/** Everything the advisor has to say right now (unfiltered, sorted). The desk picks from this. */
export function allAdvice(state: GameState): Advice[] {
  const out: Advice[] = []
  for (const ev of Object.values(state.events)) out.push(...eventAdvice(state, ev.id))
  const fin = financeAdvisor(state)
  if (fin.level !== 'info' && !out.some((a) => a.topic === 'event' && LEVEL_RANK[a.level] >= LEVEL_RANK[fin.level])) out.push({ id: 'finance-standing', level: fin.level, topic: 'finance', title: fin.standing, body: fin.reasons[0], link: { kind: 'screen', screen: 'finances' }, actionLabel: 'Open finances' })
  out.push(...sponsorAdvice(state), ...tierAdvice(state), ...businessAdvice(state))
  // Roster items are rolled up so the desk never lists a fighter at a time.
  const roster = rosterAdvice(state)
  const expiring = roster.filter((a) => a.id.endsWith('-expiry') && a.level === 'caution')
  if (expiring.length === 1) out.push(expiring[0])
  else if (expiring.length > 1) out.push({ id: 'roster-expiring', level: 'caution', topic: 'roster', title: `${expiring.length} fighters have contracts expiring soon`, body: 'Open renewal talks before a rival gets to them.', link: { kind: 'screen', screen: 'contracts' }, actionLabel: 'Contracts' })
  const idle = roster.filter((a) => a.id.endsWith('-idle'))
  if (idle.length === 1) out.push(idle[0])
  else if (idle.length > 1) out.push({ id: 'roster-idle', level: 'caution', topic: 'roster', title: `${idle.length} fighters have been inactive for months`, body: 'Fighters who do not fight do not develop, earn or build a following.', link: { kind: 'screen', screen: 'matchmaking' }, actionLabel: 'Matchmaking' })
  out.push(...roster.filter((a) => /-(morale|streak|up)$/.test(a.id)).slice(0, 3))
  return sortAdvice(out)
}

export function deskAdvice(state: GameState, mode: AdvisorMode, cap = 4): Advice[] {
  return visibleAdvice(allAdvice(state), mode, cap)
}

export { bridgeView, type BridgeView } from './systems/bridge'
export { breakEven, CONFIDENCE_LABEL, type BreakEven } from './systems/breakEven'
export { signingForecast, type SigningForecast } from './systems/signingForecast'

export { FIGHT_ASSESS_HINT } from './business/terms'
