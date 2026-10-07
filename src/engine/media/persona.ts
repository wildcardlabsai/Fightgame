/**
 * MEDIA PERSONA. How a fighter comes across to the press. It is read from the engine's existing personality (hidden truth), so
 * it shapes outcomes — how much attention an interview earns, how likely a press conference is to boil over — without ever
 * being shown unless the player has already uncovered that personality (the fighter view's `personality.trait`).
 */
import type { Personality } from '../types'

export type MediaPersona = 'QUIET' | 'CONFIDENT' | 'CHARISMATIC' | 'CONTROVERSIAL' | 'TRASH_TALKER' | 'PROFESSIONAL' | 'PRIVATE' | 'EMOTIONAL' | 'SHOWMAN'

const MAP: Record<Personality, MediaPersona> = {
  Professional: 'PROFESSIONAL', Ambitious: 'CONFIDENT', Loyal: 'PROFESSIONAL', Volatile: 'CONTROVERSIAL', Greedy: 'CONFIDENT',
  Showman: 'SHOWMAN', Quiet: 'QUIET', Arrogant: 'TRASH_TALKER', Humble: 'PRIVATE', Fragile: 'EMOTIONAL',
}

export const personaOf = (p: Personality): MediaPersona => MAP[p]

/** How much extra attention this persona earns from coverage (multiplier). */
export const ATTENTION: Record<MediaPersona, number> = { QUIET: 0.8, CONFIDENT: 1.05, CHARISMATIC: 1.2, CONTROVERSIAL: 1.25, TRASH_TALKER: 1.25, PROFESSIONAL: 0.95, PRIVATE: 0.75, EMOTIONAL: 1.0, SHOWMAN: 1.3 }
/** Chance an interview or press conference produces a controversy (added to the approach's own chance). */
export const FLASH: Record<MediaPersona, number> = { QUIET: 0, CONFIDENT: 0.03, CHARISMATIC: 0.02, CONTROVERSIAL: 0.16, TRASH_TALKER: 0.14, PROFESSIONAL: 0, PRIVATE: 0, EMOTIONAL: 0.1, SHOWMAN: 0.06 }

export const PERSONA_LABEL: Record<MediaPersona, string> = {
  QUIET: 'Quiet', CONFIDENT: 'Confident', CHARISMATIC: 'Charismatic', CONTROVERSIAL: 'Controversial', TRASH_TALKER: 'Trash talker', PROFESSIONAL: 'Professional', PRIVATE: 'Private', EMOTIONAL: 'Emotional', SHOWMAN: 'Showman',
}

const LOUD: MediaPersona[] = ['TRASH_TALKER', 'SHOWMAN', 'CONTROVERSIAL']
const CALM: MediaPersona[] = ['QUIET', 'PRIVATE', 'PROFESSIONAL']

/** How well an approach suits the fighter's persona (multiplier on its effects). */
export function approachFit(approach: string, persona: MediaPersona): number {
  const bold = approach === 'AGGRESSIVE' || approach === 'CONTROVERSIAL'
  const soft = approach === 'RESPECTFUL' || approach === 'DIPLOMATIC'
  if (bold) return LOUD.includes(persona) ? 1.35 : CALM.includes(persona) ? 0.7 : 1
  if (soft) return CALM.includes(persona) ? 1.2 : LOUD.includes(persona) ? 0.8 : 1
  return 1
}
