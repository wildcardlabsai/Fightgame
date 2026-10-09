/**
 * A promotion's standing follows its champions. Winning a belt lifts the reputation (and a little of the fanbase) of the promotion the
 * new champion fights for; losing a world title costs the promotion a little. Symmetric for every promotion, the player's included, and
 * bounded: it happens once per title change and moves reputation by well under a point.
 */
import { strategyStanding } from '../office/strategy'
import type { TitleLevel } from '../business/titleDefs'
import type { GameState, Id } from '../types'

const GAIN: Record<TitleLevel, number> = { world: 0.6, european: 0.3, domestic: 0.15, area: 0.05 }
const LOSS: Record<TitleLevel, number> = { world: 0.25, european: 0.1, domestic: 0, area: 0 }

const promoOf = (state: GameState, fighterId: Id) => {
  const c = state.fighters[fighterId]?.contractId
  return c ? state.promotions[state.contracts[c]?.promotionId] : undefined
}

export function creditTitleChange(state: GameState, winner: Id, previous: Id | null, level: TitleLevel): void {
  if (!state.media?.effects) return // with the media world only observing, titles do not shape the sport
  const w = promoOf(state, winner)
  if (w) { w.reputation = Math.min(100, w.reputation + GAIN[level] * (w.isPlayer ? strategyStanding(state) : 1)); w.fanbase = Math.round(w.fanbase * (1 + 0.004 * (GAIN[level] / 0.6))) }
  const l = previous ? promoOf(state, previous) : undefined
  if (l && l !== w) l.reputation = Math.max(0, l.reputation - LOSS[level])
}
