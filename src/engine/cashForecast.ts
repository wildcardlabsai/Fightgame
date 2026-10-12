/**
 * 12-WEEK CASH OUTLOOK for the Finances screen: today's cash, less the running costs each week, plus the forecast profit (low / middle / high) of
 * each of your open shows in the week it is held. Same public forecast the event page shows; an outlook, not a promise.
 */
import { weeksBetween } from './calendar'
import { forecastEvent } from './events/demand'
import { playerOpenEvents } from './events/events'
import { player, weeklyBurn } from './selectors'
import type { GameState } from './types'

export interface CashPoint { week: number; low: number; mid: number; high: number }
export interface CashOutlook { points: CashPoint[]; burn: number; shows: { week: number; name: string; lo: number; hi: number }[]; lowestMid: { week: number; cash: number }; runsOutWeek: number | null }

export function cashOutlook(state: GameState, weeks = 12): CashOutlook {
  const cash = player(state).cash
  const burn = weeklyBurn(state).total
  const shows = playerOpenEvents(state).map((ev) => {
    const f = forecastEvent(state, ev)
    return { week: Math.max(0, weeksBetween(state.today, ev.day)), name: ev.name, lo: f.profit.lo, hi: f.profit.hi }
  }).filter((s) => s.week <= weeks)
  const points: CashPoint[] = []
  for (let w = 0; w <= weeks; w++) {
    const done = shows.filter((s) => s.week <= w)
    const base = cash - burn * w
    const lo = done.reduce((a, s) => a + s.lo, 0), hi = done.reduce((a, s) => a + s.hi, 0)
    points.push({ week: w, low: Math.round(base + lo), mid: Math.round(base + (lo + hi) / 2), high: Math.round(base + hi) })
  }
  const lowest = points.reduce((m, p) => (p.mid < m.cash ? { week: p.week, cash: p.mid } : m), { week: 0, cash: points[0].mid })
  const out = points.find((p) => p.mid < 0)
  return { points, burn: Math.round(burn), shows, lowestMid: lowest, runsOutWeek: out ? out.week : null }
}
