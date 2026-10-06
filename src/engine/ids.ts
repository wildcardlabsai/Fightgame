import type { GameState } from './types'

/** Anything that can mint unique, deterministic ids. */
export interface IdSource {
  next(prefix: string): string
}

/** Standalone generator used while building a brand-new world. */
export class IdGen implements IdSource {
  counter: number
  constructor(counter = 0) {
    this.counter = counter
  }
  next(prefix: string): string {
    this.counter += 1
    return `${prefix}_${this.counter.toString(36)}`
  }
}

/** Generator bound to a live GameState: shares and advances `state.idCounter`. */
export function stateIds(state: GameState): IdSource {
  return {
    next(prefix: string): string {
      state.idCounter += 1
      return `${prefix}_${state.idCounter.toString(36)}`
    },
  }
}
