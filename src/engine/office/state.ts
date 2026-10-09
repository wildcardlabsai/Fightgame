import type { Day, GameState, Id } from '../types'
import { emptyOffice, OFFICE_LIMITS, type CareerDecision, type OfficeState } from './types'

export function officeOf(state: GameState): OfficeState {
  if (!state.office) { state.office = emptyOffice(); state.office.strategy.since = state.today }
  return state.office
}

export function nextOfficeId(state: GameState, prefix: string): string {
  const o = officeOf(state)
  o.n += 1
  return `${prefix}${o.n.toString(36)}`
}

/** True the first time a key is seen; remembers it in a bounded ring. The guard against applying one effect twice (replays, retries). */
export function once(state: GameState, key: string): boolean {
  const o = officeOf(state)
  if (o.applied.includes(key)) return false
  o.applied.push(key)
  if (o.applied.length > OFFICE_LIMITS.applied) o.applied.shift()
  return true
}

export function pairKey(a: Id, b: Id): string { return a < b ? `${a}|${b}` : `${b}|${a}` }

/** Record a career decision for a fighter (what the promoter chose, in words). Newest first, bounded. */
export function noteDecision(state: GameState, fighterId: Id, text: string): void {
  const o = officeOf(state)
  const list = (o.decisions[fighterId] ??= [])
  const entry: CareerDecision = { day: state.today, text }
  if (list[0] && list[0].text === text && list[0].day === state.today) return
  list.unshift(entry)
  if (list.length > OFFICE_LIMITS.decisions) list.length = OFFICE_LIMITS.decisions
}

export const weeksBetweenDays = (a: Day, b: Day): number => Math.floor((b - a) / 7)
