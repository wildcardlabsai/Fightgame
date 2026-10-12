/**
 * MONTHLY REVIEW: what the last four weeks did, from the books and the results (nothing new is simulated or stored). Public facts only.
 */
import { formatDay } from './calendar'
import { fightList } from './fightViews'
import { eventList } from './eventViews'
import { attentionItems } from './selectors'
import type { GameState } from './types'

export interface MonthlyReview {
  from: string; to: string
  cashChange: number
  income: number; costs: number
  wins: number; losses: number; draws: number
  shows: { name: string; profit: number | null; attendance: number | null }[]
  headline: string
  watch: { title: string; detail: string; severity: string } | null
}

export function monthlyReview(state: GameState, days = 28): MonthlyReview {
  const since = state.today - days
  const tx = state.ledger.filter((t) => t.day > since)
  const income = tx.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0)
  const costs = -tx.filter((t) => t.amount < 0).reduce((a, t) => a + t.amount, 0)
  let wins = 0, losses = 0, draws = 0
  for (const f of fightList(state, 'mine-results', 80)) {
    if (!f.day || f.day <= since || f.winner === undefined) continue
    if (f.winner === null) { draws++; continue }
    const mineIsA = f.mine && state.fights[f.id]?.sideA.promotionId === state.playerPromotionId
    const mineIsB = f.mine && state.fights[f.id]?.sideB.promotionId === state.playerPromotionId
    if ((f.winner === 0 && mineIsA) || (f.winner === 1 && mineIsB)) wins++; else if (mineIsA || mineIsB) losses++
  }
  const shows = eventList(state, 'mine-history', 12).filter((e) => e.day > since && e.statusKey !== 'cancelled').map((e) => ({ name: e.name, profit: e.profit ?? null, attendance: e.attendance ?? null }))
  const net = income - costs
  const top = attentionItems(state).find((a) => a.severity !== 'info') ?? null
  const showProfit = shows.reduce((a, s) => a + (s.profit ?? 0), 0)
  const headline = shows.length === 0 && wins + losses + draws === 0 ? 'A quiet month: no show was held and no fight took place.'
    : `${shows.length} show${shows.length === 1 ? '' : 's'}${shows.length ? ` (${showProfit >= 0 ? 'profit' : 'loss'} on the night)` : ''}, ${wins} win${wins === 1 ? '' : 's'} and ${losses} loss${losses === 1 ? '' : 'es'} for your fighters; the books moved by ${net >= 0 ? '+' : '−'}£${Math.abs(Math.round(net)).toLocaleString('en-GB')}.`
  return { from: formatDay(since + 1), to: formatDay(state.today), cashChange: Math.round(net), income: Math.round(income), costs: Math.round(costs), wins, losses, draws, shows, headline, watch: top ? { title: top.title, detail: top.detail, severity: top.severity } : null }
}
