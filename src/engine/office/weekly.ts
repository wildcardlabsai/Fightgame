import { weekIndex } from '../media/util'
import type { GameState } from '../types'
import { processGoals } from './goals'
import { generateOffers, processOffers } from './offers'
import { easeRelations } from './relations'
import { officeOf } from './state'

/** The office's weekly pass, in a fixed order: answer what is pending, then consider anything new, then tidy. Safe to run on any state. */
export function processOffice(state: GameState): void {
  officeOf(state) // an old save that has not been through the migration yet still gets its office
  processOffers(state)
  generateOffers(state)
  processGoals(state)
  if (weekIndex(state) % 13 === 0) easeRelations(state)
}
