/** Pure: the championship distance for a given stake. Kept free of engine imports so any layer may use it. */
import { ELIMINATOR_ROUNDS, TITLE_ROUNDS, type TitleLevel } from './titleDefs'

export type StakeKind = 'standard' | 'eliminator' | 'title' | 'unification'
export interface StakeFacts { kind: StakeKind; level: TitleLevel | null }

/** The distance a fight with these stakes must have, or null when nothing is at stake (the career rules decide). */
export function requiredRounds(s: StakeFacts): number | null {
  if (s.kind === 'standard' || !s.level) return null
  return s.kind === 'eliminator' ? ELIMINATOR_ROUNDS[s.level] : TITLE_ROUNDS[s.level]
}

