import { MAX_LEDGER } from './config'
import { stateIds } from './ids'
import { player } from './selectors'
import type { GameState, TransactionCategory } from './types'

/**
 * The ONLY way the player's cash may change after game creation. Every post
 * writes a ledger line and moves cash in the same step, so
 * `cash === ledgerArchive + sum(ledger)` always holds.
 */
export function post(state: GameState, category: TransactionCategory, amount: number, description: string): void {
  if (amount === 0) return
  const amt = Math.round(amount)
  state.ledger.unshift({ id: stateIds(state).next('t'), day: state.today, category, amount: amt, description })
  player(state).cash += amt
  while (state.ledger.length > MAX_LEDGER) {
    const dropped = state.ledger.pop()!
    state.ledgerArchive += dropped.amount
  }
}

export function canAfford(state: GameState, amount: number): boolean {
  return player(state).cash >= amount
}
