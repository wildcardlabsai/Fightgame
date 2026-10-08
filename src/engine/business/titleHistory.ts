/**
 * Per-fighter title memory: a tiny, bounded record kept as titles change hands, so market value, ambitions and the career ladder
 * never have to replay history. Written ONLY from real title events (see media/titles.ts).
 */
import type { Day, GameState, Id } from '../types'
import { biz } from './talkCore'
import { levelRank, type TitleLevel } from './titleDefs'

export function noteTitleWon(state: GameState, id: Id, level: TitleLevel): void {
  const h = (biz(state).titleHist[id] ??= { won: 0, defences: 0, best: null, unifiedDay: null, undisputedDay: null })
  h.won += 1
  if (!h.best || levelRank(level) > levelRank(h.best)) h.best = level
}

export function noteDefence(state: GameState, id: Id): void {
  const h = (biz(state).titleHist[id] ??= { won: 0, defences: 0, best: null, unifiedDay: null, undisputedDay: null })
  h.defences += 1
}

export function noteUnified(state: GameState, id: Id, day: Day, undisputed: boolean): void {
  const h = (biz(state).titleHist[id] ??= { won: 0, defences: 0, best: null, unifiedDay: null, undisputedDay: null })
  if (h.unifiedDay === null) h.unifiedDay = day
  if (undisputed && h.undisputedDay === null) h.undisputedDay = day
}

/** Retired fighters keep a one-line legacy; their detailed memory goes after a few years (bounded state). */
export function pruneTitleHistory(state: GameState): void {
  const b = state.business
  if (!b) return
  for (const id of Object.keys(b.titleHist)) {
    const f = state.fighters[id]
    if (!f) delete b.titleHist[id]
  }
}
