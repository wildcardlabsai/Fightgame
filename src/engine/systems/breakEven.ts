/**
 * WHAT STAYING OPEN COSTS, AND HOW MANY SHOWS IT TAKES. Read straight from the books: the running costs the promotion pays every week whether or not
 * a show happens (overhead, retainers, scouts, coaching, any bridge-loan instalment) set against what the completed shows of the last twelve months
 * actually earned after their own costs. No second finance model: the ledger and the event results are the only inputs.
 */
import { loanWeekly } from './bridge'
import { playerRoster, weeklyBurn } from '../selectors'
import type { GameState } from '../types'

/** How much to trust a show-based estimate: by completed shows in the last 12 months (and half a year of history). The same rule on the Finances panel and at signing. */
export type Confidence = 'insufficient' | 'early' | 'historical'
export const confidenceOf = (shows: number, young: boolean): Confidence => (shows < 3 || young ? 'insufficient' : shows < 6 ? 'early' : 'historical')
export const CONFIDENCE_LABEL: Record<Confidence, string> = { insufficient: 'Insufficient history', early: 'Early estimate', historical: 'Historical estimate' }

export interface BreakEven {
  confidence: Confidence
  annualRunning: number
  overhead: number
  retainers: number
  staff: number
  debtService: number
  shows: number
  avgProfit: number | null
  medianProfit: number | null
  lossMaking: number
  annualProfit: number
  /** Shows a year needed to cover the running costs at the recent average profit per show (null when there is no profit per show to speak of). */
  neededShows: number | null
  /** Bouts your fighters fought for you in the last 12 months, per fighter now under contract: a retainer is paid for fights that do not happen. */
  fightsPerFighter: number | null
  verdict: 'covering' | 'short' | 'unknown'
  note: string
}

export function breakEven(state: GameState): BreakEven {
  const b = weeklyBurn(state)
  const debt = loanWeekly(state)
  const annualRunning = Math.round((b.total + debt) * 52)
  const since = state.today - 365
  const profits = Object.values(state.events)
    .filter((e) => e.promotionId === state.playerPromotionId && e.result && e.day > since)
    .map((e) => e.result!.profit)
    .sort((a, c) => a - c)
  const shows = profits.length
  const roster = playerRoster(state).length
  const bouts = Object.values(state.fights).filter((f) => f.result && f.day > since && (f.sideA.promotionId === state.playerPromotionId || f.sideB.promotionId === state.playerPromotionId)).length
  const sum = profits.reduce((n, x) => n + x, 0)
  const avg = shows ? Math.round(sum / shows) : null
  const med = shows ? profits[Math.floor(shows / 2)] : null
  const young = state.today - state.startDay < 26 * 7
  const confidence = confidenceOf(shows, young)
  const needed = avg !== null && avg > 0 ? annualRunning / avg : null
  const verdict: BreakEven['verdict'] = shows < 3 || young ? 'unknown' : sum >= annualRunning ? 'covering' : 'short'
  const note =
    verdict === 'unknown' ? 'Too few shows yet to judge: a promotion needs about half a year of results before this means anything.'
    : verdict === 'covering' ? `The last ${shows} shows earned enough to cover a year of running costs.`
    : needed === null ? 'Recent shows are not making money, so no number of them would cover the running costs: fix the show economics first (venue, card, prices).'
    : `At the recent average you need about ${Math.ceil(needed)} shows a year to cover the running costs and you staged ${shows}. What has worked in the audited careers: more, smaller shows with younger, cheaper fighters, and fighters who fight about four times a year.`
  return {
    confidence, annualRunning, overhead: Math.round(b.overheads * 52), retainers: Math.round(b.retainers * 52), staff: Math.round((b.scouting + b.coaching) * 52), debtService: Math.round(debt * 52),
    fightsPerFighter: roster ? Math.round((bouts / roster) * 10) / 10 : null, shows, avgProfit: avg, medianProfit: med, lossMaking: profits.filter((x) => x < 0).length, annualProfit: sum, neededShows: needed, verdict, note,
  }
}
