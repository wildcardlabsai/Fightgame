/**
 * THE ONE PLACE A FIGHT'S LENGTH IS DECIDED. `Fight.scheduledRounds` is the single source of truth: it is resolved here when the fight
 * is created, agreed, scheduled, or flagged as a title fight, and again each week until fight night (a belt can come onto the line, or
 * leave it, while a fight is booked). The simulation, scorecards, Fight Night, event card, tale of the tape, career history and media
 * stories all read that persisted number; nothing infers a length from a title's name.
 *
 * A fight with a belt on the line gets the championship distance configured in `titleDefs` (TITLE_ROUNDS / ELIMINATOR_ROUNDS) and cannot be
 * given anything shorter, by the negotiation or by anything else. A fight with nothing at stake keeps the length the career rules chose.
 */
import type { Fight, GameState } from '../types'
import { levelOf, levelRank } from './titleDefs'
import { fightStakes } from './stakes'
import { requiredRounds, type StakeFacts } from './rounds'

export { requiredRounds }
export type { StakeFacts }

/** What is on the line: the persisted title flag when the fight carries one, otherwise the title system as it stands today. */
export function stakeFacts(state: GameState, fight: Fight): StakeFacts {
  const t = fight.title
  if (t && t.bodies && t.bodies.length) {
    const level = t.bodies.map(levelOf).sort((a, b) => levelRank(b) - levelRank(a))[0]
    return { kind: t.kind === 'eliminator' ? 'eliminator' : t.kind === 'unification' ? 'unification' : 'title', level }
  }
  const st = fightStakes(state, fight)
  return { kind: st.kind, level: st.level }
}

/** Resolve and persist `fight.scheduledRounds`. `preferred` is a length agreed in the talks; it only applies where nothing is at stake. */
export function settleRounds(state: GameState, fight: Fight, preferred?: number): number {
  if (fight.result || !state.media?.effects) return fight.scheduledRounds // with the media world only observing, titles do not shape the sport
  const need = requiredRounds(stakeFacts(state, fight))
  fight.scheduledRounds = need ?? (preferred && preferred >= 4 ? preferred : fight.scheduledRounds)
  return fight.scheduledRounds
}

/** The lengths the talks may offer: exactly the championship distance when a belt is at stake. */
export function roundsOptionsFor(state: GameState, fight: Fight): number[] {
  const need = requiredRounds(stakeFacts(state, fight))
  return need ? [need] : [4, 6, 8, 10]
}

/** Invariant for tests and audits: null when the fight's persisted length agrees with its persisted stakes. */
export function fightRoundsProblem(state: GameState, fight: Fight): string | null {
  if (!fight.title) return null
  const need = requiredRounds(stakeFacts(state, fight))
  if (need === null) return null
  return fight.scheduledRounds === need ? null : `${fight.title.name} is scheduled for ${fight.scheduledRounds} rounds, not ${need}`
}
