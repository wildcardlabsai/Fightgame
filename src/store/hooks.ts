import { useMemo } from 'react'
import { viewsOf, type Views } from '../engine/view'
import { useGame } from './gameStore'

/** Player-facing fighter views for the current game. The ONLY way UI components read fighters. */
export function useViews(): Views {
  const game = useGame((s) => s.game)!
  return useMemo(() => viewsOf(game), [game])
}
