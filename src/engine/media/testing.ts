/** Small helpers shared by tests. Not imported by the game. */
import type { GameState, Id } from '../types'

export const clone = (s: GameState): GameState => structuredClone(s)
export const champions = (s: GameState): Id[] => [...new Set(Object.values(s.media?.titles ?? {}).map((t) => t.c).filter((x): x is Id => !!x))]
