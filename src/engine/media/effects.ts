/**
 * The only places the media world pushes back into the game's economy. Both are small, bounded and public:
 *   mediaAppeal — extra pull of a fight from the two fighters' current media attention and any rivalry the press has built
 *   mediaHype   — build-up hype from press conferences, added to a show's overall interest
 * Both are zero when `media.effects` is off, which is how the tests prove media never changes an engine outcome on its own.
 */
import type { GameState, Id } from '../types'
import { buzzOf } from './popularity'
import { rivalryStrength } from './narratives'

export function mediaAppeal(state: GameState, a: Id, b: Id): number {
  const m = state.media
  if (!m?.effects) return 0
  return 0.5 * buzzOf(state, a) + 0.5 * buzzOf(state, b) + Math.min(6, rivalryStrength(m, a, b) * 0.06)
}

export function mediaHype(state: GameState, eventId: Id): number {
  const m = state.media
  if (!m?.effects) return 0
  return Math.min(7, (m.eventHype[eventId] ?? 0) * 0.6)
}
