/**
 * THE LIVING WORLD (Phase 5.4B): the small amount of persistent state the wider boxing industry needs beyond the existing
 * promotion, contract, event and fighter records. Everything else (market interest, rival standing, pipeline pressure) is derived.
 */
import type { Day, Id } from '../types'

/** A rival's standing offer to a free agent. The fighter decides on `decide`; a signing elsewhere before then settles it. */
export interface Pursuit {
  promoId: Id
  since: Day
  decide: Day
}

export interface WorldState {
  v: 1
  /** At most one live pursuit per promotion and per fighter. Keyed by fighter id. */
  pursuits: Record<Id, Pursuit>
  /** Rolling counts for the pipeline (see intake.ts): professionals admitted in the current 52-week window and where it started. */
  intake: { windowStart: Day; admitted: number }
}

export function emptyWorld(day: Day): WorldState {
  return { v: 1, pursuits: {}, intake: { windowStart: day, admitted: 0 } }
}
