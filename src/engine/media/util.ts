import { clamp as clampN } from '../fighters'
import { DAYS_PER_WEEK } from '../calendar'
import type { Fighter, GameState, Id } from '../types'
import type { Facts, MediaState } from './types'

export const clampTo = (v: number, lo = 0, hi = 100) => clampN(v, lo, hi)
export const round1 = (n: number) => Math.round(n * 10) / 10

/** Weeks since the game began. */
export function weekIndex(state: GameState, day = state.today): number {
  return Math.floor((day - state.startDay) / DAYS_PER_WEEK)
}

/** Media ids come from the media block's own counter so they can never shift engine ids (and so engine outcomes). */
export function nextId(media: MediaState, prefix: string): string {
  media.n += 1
  return `${prefix}_${media.n.toString(36)}`
}

export function pairKey(a: Id, b: Id): string { return a < b ? `${a}|${b}` : `${b}|${a}` }

export function fname(state: GameState, id: Id | undefined | null, fallback = 'an unnamed fighter'): string {
  const f = id ? state.fighters[id] : undefined
  return f ? `${f.firstName} ${f.lastName}` : fallback
}
export function lastName(state: GameState, id: Id | undefined | null): string {
  const f = id ? state.fighters[id] : undefined
  return f ? f.lastName : 'the fighter'
}
export const totalFightsOf = (f: Pick<Fighter, 'record'>) => f.record.wins + f.record.losses + f.record.draws

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

export function factString(facts: Facts, k: string, fallback = ''): string {
  const v = facts[k]
  return v === undefined || v === null ? fallback : String(v)
}
export const factNum = (facts: Facts, k: string, fallback = 0): number => { const v = facts[k]; return typeof v === 'number' ? v : fallback }

/** Push to a bounded list (newest first). */
export function pushCapped<T>(list: T[], item: T, cap: number): void {
  list.unshift(item)
  if (list.length > cap) list.length = cap
}
