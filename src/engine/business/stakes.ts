/**
 * WHAT IS AT STAKE in a bout between two fighters, read from the title system as it stands today. Kept apart from the negotiation code so
 * the fight lifecycle (creation, scheduling, round count) can ask the same question the conversation asks, without importing it.
 */
import { bodiesFor } from '../media/titles'
import { levelOf, levelRank, type TitleLevel } from './titleDefs'
import type { Fight, GameState } from '../types'

import type { StakeKind } from './rounds'
export type { StakeKind }
export interface Stakes { kind: StakeKind; level: TitleLevel | null; bodies: string[] }

/** What a bout between these two would be, according to the title system as it stands right now. Never a promise: it is read, not set. */
export function fightStakes(state: GameState, fight: Fight): Stakes {
  const media = state.media
  if (!media) return { kind: 'standard', level: null, bodies: [] }
  const a = fight.sideA.fighterId, b = fight.sideB.fighterId
  const bodies = bodiesFor(media, a, b, fight.weightClass)
  if (bodies.length) {
    const level = bodies.map(levelOf).sort((x, y) => levelRank(y) - levelRank(x))[0]
    const champs = new Set(bodies.filter((x) => levelOf(x) === 'world').map((x) => media.titles[`${x}|${fight.weightClass}`]?.c).filter(Boolean))
    return { kind: champs.size >= 2 ? 'unification' : 'title', level, bodies }
  }
  for (const [k, rec] of Object.entries(media.titles)) {
    const e = rec.elim
    if (!e || e.fightId || !k.endsWith(`|${fight.weightClass}`)) continue
    if ((e.a === a && e.b === b) || (e.a === b && e.b === a)) return { kind: 'eliminator', level: levelOf(k.split('|')[0]), bodies: [k.split('|')[0]] }
  }
  return { kind: 'standard', level: null, bodies: [] }
}
