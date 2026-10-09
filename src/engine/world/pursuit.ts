/**
 * Contested signings. When a rival decides to go after a free agent who matters (a name, or someone on the player's radar), it makes an
 * offer and the fighter's camp takes a week or three to decide - a window in which the player can still sign them. The record is small
 * and honest: who offered, when, and when the answer comes. The rival's appraisal of the fighter is never stored.
 *
 * Read-only helpers here are safe for view models; mutation goes through the three functions marked (writes).
 */
import type { Day, GameState, Id } from '../types'
import { emptyWorld, type Pursuit, type WorldState } from './types'

export function worldOf(state: GameState): WorldState {
  if (!state.world) state.world = emptyWorld(state.today)
  return state.world
}

/** The live offer on a fighter, if any (read-only). */
export function pursuitOf(state: GameState, fighterId: Id): Pursuit | null {
  const p = state.world?.pursuits[fighterId]
  return p && p.decide >= state.today - 7 ? p : null
}

/** (writes) A rival makes an offer. One live pursuit per fighter and per promotion. */
export function startPursuit(state: GameState, fighterId: Id, promoId: Id, decide: Day): Pursuit | null {
  const w = worldOf(state)
  if (w.pursuits[fighterId]) return null
  for (const p of Object.values(w.pursuits)) if (p.promoId === promoId) return null
  const p: Pursuit = { promoId, since: state.today, decide }
  w.pursuits[fighterId] = p
  return p
}

/** (writes) The answer has been given, or the fighter is no longer available. */
export function endPursuit(state: GameState, fighterId: Id): void {
  if (state.world) delete state.world.pursuits[fighterId]
}

/** Whole weeks until the answer is due (never below 1 while the offer is live). */
export const weeksToDecision = (state: GameState, p: Pursuit): number => Math.max(1, Math.ceil((p.decide - state.today) / 7))
