/**
 * The ONLY place event money moves. Player events post to the ledger; AI events adjust the rival's cash and its
 * accounting record. Either way the event's own tallies are updated in the same step, so settlement can be
 * reconciled against what was actually paid and received.
 */
import { post } from './ledger'
import type { BoxingEvent, EventFinance, GameState, TransactionCategory } from './types'

type RevCat = keyof EventFinance['revenue']
type CostCat = keyof EventFinance['costs']

const COST_LEDGER: Record<CostCat, TransactionCategory> = {
  venue: 'venue', marketing: 'marketing', production: 'production', purses: 'purses', bonuses: 'purses',
  officials: 'officials', security: 'security', broadcast: 'broadcast',
}

export function emptyFinance(): EventFinance {
  return {
    revenue: { tickets: 0, sponsorship: 0, broadcast: 0, ppv: 0 },
    costs: { venue: 0, marketing: 0, production: 0, purses: 0, bonuses: 0, officials: 0, security: 0, broadcast: 0 },
  }
}

export function totalRevenue(f: EventFinance): number {
  return f.revenue.tickets + f.revenue.sponsorship + f.revenue.broadcast + f.revenue.ppv
}
export function totalCosts(f: EventFinance): number {
  const c = f.costs
  return c.venue + c.marketing + c.production + c.purses + c.bonuses + c.officials + c.security + c.broadcast
}

function isPlayer(state: GameState, ev: BoxingEvent): boolean {
  return ev.promotionId === state.playerPromotionId
}

/** Money coming in (negative = refund). */
export function receive(state: GameState, ev: BoxingEvent, cat: RevCat, amount: number, description: string): void {
  const amt = Math.round(amount)
  if (amt === 0) return
  ev.finance.revenue[cat] += amt
  if (isPlayer(state, ev)) post(state, cat === 'tickets' ? 'tickets' : cat === 'sponsorship' ? 'sponsorship' : cat === 'ppv' ? 'ppv' : 'broadcast', amt, description)
  else {
    const p = state.promotions[ev.promotionId]
    p.cash += amt
    if (p.accounting) p.accounting.revenue += amt
  }
}

/** Money going out (positive amount = cost). */
export function spend(state: GameState, ev: BoxingEvent, cat: CostCat, amount: number, description: string): void {
  const amt = Math.round(amount)
  if (amt === 0) return
  ev.finance.costs[cat] += amt
  if (isPlayer(state, ev)) post(state, COST_LEDGER[cat], -amt, description)
  else {
    const p = state.promotions[ev.promotionId]
    p.cash -= amt
    if (p.accounting) p.accounting.costs += amt
  }
}
