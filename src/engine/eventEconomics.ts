/**
 * EVENT ECONOMICS (Phase 9): the forecast, broken into the lines the settlement will actually post, with a break-even and a plain account of what is
 * driving a loss.
 *
 * Nothing here is a new rule. Every figure is read from the same functions the settlement uses (venue hire, production, officials, travel, agreed
 * purses, security per head, the sanctioning levy), and the totals equal `forecastEvent`'s ranges by construction (tests compare them with the real
 * settlement). Public information only: it never reads hidden fighter attributes or the keyed noise that decides the real crowd.
 *
 * It describes; it does not tune. The levers it names are controls that exist today, and it never says a lever will make a show profitable.
 */
import { BALANCE as B } from './balance'
import { eventRiskOf } from './advisor'
import { cardFighterIds, travelCost } from './business/venues'
import { broadcastTerms, cardFights, forecastEvent, hireFor, inventory, officialsCost, productionCost, purseCommitments, venueOf, type Forecast, type Range } from './events/demand'
import type { BoxingEvent, GameState } from './types'

const E = B.events

export type CostBasis = 'committed' | 'crowd' | 'results'
export interface EconLine { key: string; label: string; lo: number; hi: number; basis: CostBasis; note: string }
export interface RevLine { key: string; label: string; lo: number; hi: number; note: string }

export interface VenueAlt { name: string; city: string; capacity: number; profit: Range; hire: number }

export interface BreakEven {
  /** Tickets that must be sold to cover costs, at the forecast price mix and with sponsor/broadcast taken at their LOW estimate. Null when it cannot be worked out. */
  attendance: number | null
  capacity: number
  /** Average price per ticket at the forecast mix (or the full-house mix when nothing is forecast to sell). */
  avgTicket: number
  /** The whole house sold at the current prices: gate, and the result after the costs that scale with the crowd. */
  fullHouse: { gate: number; costs: number; profit: number }
  /** The average ticket needed to break even at a sell-out, ignoring that demand falls as prices rise. */
  avgTicketNeededAtSellOut: number | null
  verdict: 'coveredBeforeSales' | 'reachable' | 'tightNearSellOut' | 'beyondSellOut' | 'unknown'
  assumptions: string[]
}

export interface Lever { id: 'prices' | 'venue' | 'card' | 'marketing' | 'broadcast' | 'sponsors'; text: string }

export interface EventEconomics {
  costs: EconLine[]
  costTotal: Range
  revenue: RevLine[]
  revenueTotal: Range
  profit: Range
  /** Owed whatever the crowd does: venue, production, officials, travel, agreed purses, marketing budget. */
  committed: number
  breakEven: BreakEven
  /** Biggest cost lines first, as a share of the expected (middle) total. */
  drivers: { label: string; amount: number; share: number }[]
  /** Plain statements of what the numbers say; empty when the show is comfortably forecast to profit. */
  explanation: string[]
  levers: Lever[]
  cash: number
  /** Cash left if the worst end of the forecast happens (before the week's ordinary bills). */
  cashAfterWorst: number
}

const mid = (r: Range) => (r.lo + r.hi) / 2
const money = (n: number) => `£${Math.round(Math.abs(n)).toLocaleString('en-GB')}`

export function eventEconomics(state: GameState, ev: BoxingEvent, alternatives: VenueAlt[] = [], f: Forecast = forecastEvent(state, ev)): EventEconomics {
  const v = venueOf(state, ev)
  const fights = cardFights(state, ev)
  const c = purseCommitments(state, ev)
  const bt = broadcastTerms(state, ev, ev.broadcast.kind, 'public')
  const hire = hireFor(state, v, ev.promotionId)
  const bonusesLo = c.bonusesExpected * 0.7

  const costs: EconLine[] = [
    { key: 'venue', label: 'Venue hire', lo: hire, hi: hire, basis: 'committed', note: `${v.name}; paid when the venue is booked.` },
    { key: 'purses', label: 'Fighter purses', lo: c.purses, hi: c.purses, basis: 'committed', note: `Guaranteed purses for the ${fights.length} fight${fights.length === 1 ? '' : 's'} on the card, as agreed in each negotiation. Owed win or lose, sell or not.` },
    { key: 'production', label: 'Production', lo: productionCost(v), hi: productionCost(v), basis: 'committed', note: 'Staging, ring, lighting and sound for this venue.' },
    ...(bt.production > 0 ? [{ key: 'broadcastProduction', label: 'Broadcast production', lo: bt.production, hi: bt.production, basis: 'committed' as CostBasis, note: 'Cameras and crew for the broadcast you chose.' }] : []),
    { key: 'officials', label: 'Officials, medical & insurance', lo: officialsCost(fights.length), hi: officialsCost(fights.length), basis: 'committed', note: 'Scales with the number of fights.' },
    { key: 'travel', label: 'Travel & accommodation', lo: travelCost(state, cardFighterIds(fights), v), hi: travelCost(state, cardFighterIds(fights), v), basis: 'committed', note: 'Fighters who live far from the venue.' },
    ...(ev.marketing.budget > 0 ? [{ key: 'marketing', label: 'Marketing', lo: ev.marketing.budget, hi: ev.marketing.budget, basis: 'committed' as CostBasis, note: 'The budget you set; paid in weekly instalments.' }] : []),
    { key: 'security', label: 'Security & stewarding', lo: f.attendance.lo * E.costs.securityPerHead, hi: f.attendance.hi * E.costs.securityPerHead, basis: 'crowd', note: `£${E.costs.securityPerHead.toFixed(2)} for every person who attends.` },
    { key: 'levy', label: 'Sanctioning & licensing levy', lo: f.ticketRevenue.lo * E.costs.sanctionShare, hi: f.ticketRevenue.hi * E.costs.sanctionShare, basis: 'crowd', note: `${Math.round(E.costs.sanctionShare * 100)}% of ticket revenue is paid to the sanctioning body.` },
    { key: 'bonuses', label: 'Win bonuses', lo: bonusesLo, hi: c.bonusesMax, basis: 'results', note: 'Paid to the winner of each fight, so they depend on results.' },
  ]
  const costTotal: Range = { lo: costs.reduce((n, l) => n + l.lo, 0), hi: costs.reduce((n, l) => n + l.hi, 0) }

  const revenue: RevLine[] = [
    { key: 'tickets', label: 'Tickets', lo: f.ticketRevenue.lo, hi: f.ticketRevenue.hi, note: `${Math.round(f.attendance.lo).toLocaleString('en-GB')}–${Math.round(f.attendance.hi).toLocaleString('en-GB')} seats of ${v.capacity.toLocaleString('en-GB')} at the prices set.` },
    ...(f.sponsorship.hi > 0 ? [{ key: 'sponsorship', label: 'Sponsorship', lo: f.sponsorship.lo, hi: f.sponsorship.hi, note: 'The accepted sponsor’s fee and any bonus it pays.' }] : []),
    ...(ev.broadcast.kind !== 'none' && ev.broadcast.kind !== 'ppv' ? [{ key: 'broadcast', label: 'Broadcast', lo: f.broadcast.lo, hi: f.broadcast.hi, note: 'The broadcast deal you chose.' }] : []),
    ...(ev.broadcast.kind === 'ppv' ? [{ key: 'ppv', label: 'Pay-per-view', lo: f.ppvRevenue.lo, hi: f.ppvRevenue.hi, note: 'Your share of PPV sales.' }] : []),
  ]
  const revenueTotal: Range = { lo: revenue.reduce((n, l) => n + l.lo, 0), hi: revenue.reduce((n, l) => n + l.hi, 0) }

  const committed = costs.filter((l) => l.basis === 'committed').reduce((n, l) => n + l.lo, 0)
  const nonTicketLo = revenueTotal.lo - f.ticketRevenue.lo

  // ---- break-even
  const inv = inventory(v)
  const price = [ev.prices.ga, ev.prices.premium, ev.prices.vip]
  const fullGate = inv[0] * price[0] + inv[1] * price[1] + inv[2] * price[2]
  const attMid = mid(f.attendance)
  const avgTicket = attMid > 0 ? mid(f.ticketRevenue) / attMid : v.capacity > 0 ? fullGate / v.capacity : 0
  const perHeadNet = avgTicket * (1 - E.costs.sanctionShare) - E.costs.securityPerHead
  const fixedAndBonus = committed + c.bonusesExpected
  const fullHouseCosts = committed + c.bonusesExpected + v.capacity * E.costs.securityPerHead + fullGate * E.costs.sanctionShare
  const fullHouseProfit = fullGate + nonTicketLo - fullHouseCosts
  const need = fixedAndBonus - nonTicketLo
  let attendance: number | null = null
  let verdict: BreakEven['verdict'] = 'unknown'
  if (fights.length > 0 && perHeadNet > 0) {
    attendance = need <= 0 ? 0 : Math.ceil(need / perHeadNet)
    verdict = need <= 0 ? 'coveredBeforeSales' : attendance > v.capacity ? 'beyondSellOut' : attendance > 0.85 * v.capacity ? 'tightNearSellOut' : 'reachable'
  } else if (fights.length > 0) verdict = 'beyondSellOut'
  const netPerSeatFull = v.capacity > 0 ? (1 - E.costs.sanctionShare) : 0
  const avgNeededAtSellOut = fights.length > 0 && v.capacity > 0 && netPerSeatFull > 0 ? Math.max(0, (need / v.capacity + E.costs.securityPerHead) / netPerSeatFull) : null
  const breakEven: BreakEven = {
    attendance: attendance === null ? null : Math.min(attendance, Math.max(attendance, 0)), capacity: v.capacity, avgTicket, fullHouse: { gate: fullGate, costs: fullHouseCosts, profit: fullHouseProfit },
    avgTicketNeededAtSellOut: avgNeededAtSellOut, verdict,
    assumptions: [
      'Estimates from public information, not promises: the real crowd can land outside the forecast range.',
      'Ticket mix and prices are as set now; the break-even moves if you change them.',
      'Sponsor and broadcast income is counted at the low end; win bonuses at the expected amount.',
    ],
  }

  // ---- what is driving it
  const totalMid = mid(costTotal)
  const drivers = costs.map((l) => ({ label: l.label, amount: mid(l), share: totalMid > 0 ? mid(l) / totalMid : 0 })).filter((d) => d.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 3)
  const profit = f.profit
  const explanation: string[] = []
  if (fights.length > 0 && (mid(profit) < 0 || profit.lo < 0)) {
    if (profit.hi < 0) explanation.push(`Even the best case in this forecast loses ${money(profit.hi)}; the likely result is a loss of about ${money(mid(profit))}.`)
    else if (mid(profit) < 0) explanation.push(`The forecast centres on a loss of about ${money(mid(profit))}, with a possible range from ${money(profit.lo)} loss to ${profit.hi >= 0 ? money(profit.hi) + ' profit' : money(profit.hi) + ' loss'}.`)
    else explanation.push(`The forecast centres on a profit of about ${money(mid(profit))}, but the poor end of the range loses ${money(profit.lo)}.`)
    explanation.push(`Selling every one of the ${v.capacity.toLocaleString('en-GB')} seats at today’s prices would bring about ${money(fullGate)} in tickets. After the costs that grow with the crowd, a sell-out would ${fullHouseProfit >= 0 ? `leave about ${money(fullHouseProfit)} profit` : `still lose about ${money(fullHouseProfit)}`}.`)
    if (drivers.length) explanation.push(`The biggest costs are ${drivers.map((d) => `${d.label.toLowerCase()} (${money(d.amount)}, ${Math.round(d.share * 100)}%)`).join(', ')}. ${money(committed)} of the costs are owed whatever the crowd does.`)
    if (verdict === 'beyondSellOut') explanation.push('At these prices the building cannot hold enough paying fans to cover the costs.')
    else if (attendance !== null && attendance > 0) explanation.push(`Break-even is about ${attendance.toLocaleString('en-GB')} tickets (${Math.round((100 * attendance) / Math.max(1, v.capacity))}% of the hall) against a forecast of ${Math.round(f.attendance.lo).toLocaleString('en-GB')}–${Math.round(f.attendance.hi).toLocaleString('en-GB')}.`)
  }

  // ---- levers that exist today (named, never promised)
  const levers: Lever[] = []
  const open = ['venueBooked', 'cardBuilding'].includes(ev.status)
  if (open || ['onSale', 'promoting'].includes(ev.status)) levers.push({ id: 'prices', text: `Ticket prices are editable (general admission £${ev.prices.ga}, suggested £${f.refPrices.ga}). A higher price earns more per seat but fewer fans buy; the forecast re-calculates as you change it.` })
  const cheaper = alternatives.filter((a) => mid(a.profit) > mid(profit)).sort((a, b) => mid(b.profit) - mid(a.profit))[0]
  if (cheaper) {
    const early = Math.round(E.cancelRefund.early * 100)
    levers.push({ id: 'venue', text: `The same card is forecast to do better at ${cheaper.name}, ${cheaper.city} (${cheaper.capacity.toLocaleString('en-GB')} seats: ${money(cheaper.profit.lo)} ${cheaper.profit.lo < 0 ? 'loss' : 'profit'} to ${money(cheaper.profit.hi)} ${cheaper.profit.hi < 0 ? 'loss' : 'profit'}). A show’s venue cannot be swapped: cancelling refunds ${early}% of the hire if the show is ${E.cancelEarlyWeeks}+ weeks away and nothing later, and the agreed fights go back to your list to be booked again.` })
  }
  if (c.purses > 0 && c.purses >= 0.3 * totalMid) levers.push({ id: 'card', text: `Purses (${money(c.purses)}) are fixed by the terms agreed for each fight. Fights can come off this card and different opponents can be negotiated in Matchmaking, but the agreed terms of a fight do not change on this page.` })
  if (ev.sponsor.offers.length > 0 && !ev.sponsor.accepted) levers.push({ id: 'sponsors', text: `${ev.sponsor.offers.length} sponsor offer${ev.sponsor.offers.length === 1 ? ' is' : 's are'} waiting for this show (Sponsors section); an accepted sponsor adds a fee to the revenue side.` })
  if (ev.broadcast.kind === 'none') {
    const tv = broadcastTerms(state, ev, 'localTv', 'public')
    if (tv.available && tv.fee > 0) levers.push({ id: 'broadcast', text: `Local TV would pay a fee of about ${money(tv.fee)} but adds ${money(tv.production)} of broadcast production, so it helps only if the fee exceeds that.` })
  }
  if (ev.marketing.level === 'none' && open) levers.push({ id: 'marketing', text: 'Marketing costs money now and lifts demand over the weeks on sale; with a small hall that is already selling out it will not help.' })

  const cash = state.promotions[ev.promotionId].cash
  // the same "cash after the poor case" the advisor and the sale confirmation quote: money already spent on the show is already out of the bank
  const risk = eventRiskOf(state, ev.id)
  return { costs, costTotal, revenue, revenueTotal, profit, committed, breakEven, drivers, explanation, levers, cash, cashAfterWorst: risk ? risk.worstCash : cash + Math.min(0, profit.lo) }
}
