import type { FightingStyle } from '../types'

/**
 * How each fighting style behaves in the ring. These are simulation parameters (engine truth about what a
 * style *does*) — the style label itself is public, so the player can reason about matchups the way a fan would.
 */
export interface StyleProfile {
  /** Multiplies punch volume. */
  vol: number
  /** Shifts the share of punches that are power shots. */
  powerShift: number
  /** Accuracy edge when attacking. */
  land: number
  /** Extra defensive effectiveness. */
  guard: number
  /** 0–1: bonus when the opponent throws a lot (counter opportunities). */
  counter: number
  /** Multiplies damage dealt. */
  dmgDealt: number
  /** Multiplies damage taken. */
  dmgTaken: number
  /** Multiplies stamina drain. */
  drain: number
  /** Clinch tendency multiplier (stat/narrative). */
  clinch: number
  /** How strongly the fighter forces the pace on both fighters (0–1). */
  paceSetter: number
  /** Extra judge appeal for clean, technical work. */
  judgeAppeal: number
  /** Efficiency lost late when trailing and forced to chase (counter styles). */
  chasePenalty: number
}

const N: StyleProfile = {
  vol: 1, powerShift: 0, land: 0, guard: 0, counter: 0, dmgDealt: 1, dmgTaken: 1, drain: 1, clinch: 1, paceSetter: 0, judgeAppeal: 0, chasePenalty: 0,
}

export const STYLES: Record<FightingStyle, StyleProfile> = {
  'Pressure Fighter': { ...N, vol: 1.22, powerShift: 0.04, land: 0.0, guard: -0.03, dmgTaken: 1.1, drain: 1.2, clinch: 1.3, paceSetter: 0.7 },
  Boxer: { ...N, vol: 1.0, land: 0.02, guard: 0.02, judgeAppeal: 0.01 },
  'Counter Puncher': { ...N, vol: 0.8, land: 0.01, guard: 0.03, counter: 0.9, dmgDealt: 1.1, drain: 0.9, chasePenalty: 0.1 },
  Swarmer: { ...N, vol: 1.32, powerShift: -0.1, land: -0.02, guard: -0.02, dmgTaken: 1.05, drain: 1.25, clinch: 1.4, paceSetter: 0.8, judgeAppeal: 0.02 },
  'Power Puncher': { ...N, vol: 0.9, powerShift: 0.12, land: -0.02, guard: -0.02, dmgDealt: 1.14, drain: 1.1 },
  'Technical Boxer': { ...N, vol: 1.0, powerShift: -0.04, land: 0.04, guard: 0.03, dmgDealt: 0.92, judgeAppeal: 0.05 },
  'Defensive Specialist': { ...N, vol: 0.78, land: 0.01, guard: 0.07, dmgTaken: 0.85, drain: 0.85, clinch: 1.15, judgeAppeal: -0.02 },
  Balanced: N,
}

/** Public "what to expect" line for a pairing of styles, phrased the way an informed fan would. */
export function matchupNote(me: FightingStyle, them: FightingStyle): string {
  const key = `${me}|${them}`
  const notes: Record<string, string> = {
    'Counter Puncher|Pressure Fighter': 'A counter puncher can make a pressure fighter pay for walking forward.',
    'Counter Puncher|Swarmer': 'Volume gives a counter puncher plenty of openings — if they can keep up.',
    'Pressure Fighter|Counter Puncher': 'Walking onto counters is risky for a pressure fighter.',
    'Swarmer|Counter Puncher': 'Counters can punish a swarmer who stays in the pocket.',
    'Power Puncher|Defensive Specialist': 'Hard to land clean on a defensive specialist — power needs openings.',
    'Defensive Specialist|Power Puncher': 'A defensive specialist can frustrate a power puncher, but one shot changes everything.',
    'Technical Boxer|Pressure Fighter': 'Technique against pressure: distance and movement are the whole fight.',
    'Pressure Fighter|Technical Boxer': 'A technical boxer can be hard to pin down; pressure must cut off the ring.',
    'Swarmer|Power Puncher': 'Volume vs. power — the swarmer must avoid the big shots.',
    'Power Puncher|Swarmer': 'A power puncher may be overwhelmed by volume — unless the first big shot lands.',
  }
  if (notes[key]) return notes[key]
  if (me === them) return 'A mirror-image matchup — small edges will decide it.'
  return 'No obvious stylistic edge either way.'
}
