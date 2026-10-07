/** Tells the asset registry which world the current game belongs to (fighter art is per-world). No game state is changed. */
import { setArtWorld } from '../assets/registry'
import { useGame } from './gameStore'

let last: string | null | undefined
useGame.subscribe((s) => {
  const seed = s.game?.seed ?? null
  if (seed !== last) { last = seed; setArtWorld(seed) }
})
