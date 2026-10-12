/** Tells the asset registry which world the current game belongs to (fighter art is per-world). No game state is changed. */
import { setArtWorld, setPortraitRoster } from '../assets/registry'
import { fighterIds } from '../engine/view'
import { useGame } from './gameStore'

let last: string | null | undefined
let lastCounter = -1
useGame.subscribe((s) => {
  const seed = s.game?.seed ?? null
  // Fighters only ever appear with an id, so the id counter says when the roster could have changed (an O(1) check per store update).
  const counter = s.game?.idCounter ?? -1
  if (seed !== last) { last = seed; lastCounter = -2; setArtWorld(seed) }
  if (counter !== lastCounter) { lastCounter = counter; setPortraitRoster(s.game ? fighterIds(s.game) : null, seed) }
})
