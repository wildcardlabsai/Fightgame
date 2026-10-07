import { createNewGame } from '../engine/worldgen'
import type { GameState } from '../engine/types'

export const CANON_SEED = 'fight-empire-canon'
/** The world the artwork is generated for (and the CLI/test both build the same one). */
export function canonWorld(seed = CANON_SEED, scenario = 'groundUp'): GameState {
  return createNewGame({ seed, promotionName: 'Your Promotion', promoterName: 'Promoter', homeCountry: 'ENG', difficulty: 'standard', logo: { monogram: 'YP', color: '#e11d2a', emblem: 'bolt' }, scenario: scenario as 'groundUp' }, 1_700_000_000_000)
}
