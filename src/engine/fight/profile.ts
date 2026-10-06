import { BALANCE as B } from '../balance'
import { clamp, fighterAge } from '../fighters'
import { weightClass, WEIGHT_CLASSES } from '../../data/weightClasses'
import type { Fighter, FightPlan, FightSide, FightingStyle, GameState, WeightClassId } from '../types'

/** Everything the simulation needs about one fighter on the night. Attributes normalised to 0–1. */
export interface SimFighter {
  pow: number; spd: number; def: number; sta: number; chin: number
  iq: number; agg: number; dis: number; com: number; hrt: number; ada: number
  style: FightingStyle
  plan: FightPlan
  /** Experience 0–1 (fights and rounds). */
  exp: number
  /** Starting energy 0–1 from fitness, conditioning and camp. */
  energy0: number
  /** Starting confidence 0–1. */
  conf0: number
  /** Recovery rate multiplier (declines with age). */
  recovery: number
  /** 0–1, scaled injury proneness. */
  injuryRisk: number
  reach: number
  age: number
  home: boolean
  /** Sharpness multiplier from camp & morale. */
  sharp: number
}

const n = (v: number) => clamp(v, 1, 100) / 100

/** Age effects on the night: recovery slows and injuries get likelier; experience helps the ring IQ side. */
export function ageRecovery(age: number): number {
  return clamp(1 - 0.03 * Math.max(0, age - 28), 0.5, 1)
}
export function ageInjuryMult(age: number): number {
  return 1 + 0.04 * Math.max(0, age - 28)
}

export function sizeEdge(a: WeightClassId, b: WeightClassId): number {
  const ia = WEIGHT_CLASSES.findIndex((w) => w.id === a)
  const ib = WEIGHT_CLASSES.findIndex((w) => w.id === b)
  return ia - ib
}

/** Weight classes are adjacent or identical — otherwise a bout is not allowed. */
export function weightCompatible(a: WeightClassId, b: WeightClassId): 'same' | 'catchweight' | 'no' {
  const d = Math.abs(sizeEdge(a, b))
  return d === 0 ? 'same' : d === 1 ? 'catchweight' : 'no'
}

const FOCUS_ATTRS: Record<string, ('pow' | 'spd' | 'def' | 'sta' | 'chin' | 'iq' | 'agg' | 'hrt' | 'ada')[]> = {
  power: ['pow', 'agg'], speed: ['spd', 'ada'], defence: ['def', 'chin'], stamina: ['sta', 'hrt'], technique: ['iq', 'ada', 'def'],
}

/**
 * Build the sim profile from ENGINE TRUTH. Camp quality, training focus, plan, injuries and the heavier fighter's
 * size advantage all become temporary modifiers here — permanent attributes are never touched by a fight.
 */
export function buildSimFighter(state: GameState, f: Fighter, side: FightSide, opts: { home: boolean; sizeSteps: number }): SimFighter {
  const age = fighterAge(f, state.today)
  const a = f.attributes
  const prep = side.prep
  const intensity = prep.intensity === 'intense' ? 1.25 : prep.intensity === 'light' ? 0.6 : 1
  const camp = Math.min(1, prep.campWeeks / B.fights.campWeeks) * intensity
  const size = 1 + 0.03 * opts.sizeSteps
  const fit = (f.fitness + f.conditioning) / 200
  const conf0 = clamp(f.confidence / 100 * 0.6 + f.morale / 100 * 0.4 + 0.02 * camp, 0.05, 1)
  const sim: SimFighter = {
    pow: n(a.power) * size, spd: n(a.speed), def: n(a.defence), sta: n(a.stamina), chin: n(a.chin) * size,
    iq: n(a.ringIQ), agg: n(a.aggression), dis: n(f.discipline), com: n(f.composure), hrt: n(a.heart), ada: n(a.adaptability),
    style: f.style, plan: prep.plan, exp: clamp(Math.min(1, (f.record.wins + f.record.losses + f.record.draws) / 30) * 0.6 + Math.min(1, f.roundsFought / 150) * 0.4, 0, 1),
    energy0: clamp(0.55 + 0.45 * fit + 0.03 * camp - (prep.weightIssue ? 0.06 : 0) - (prep.nagging ? 0.04 : 0), 0.35, 1),
    conf0, recovery: ageRecovery(age) * (0.9 + 0.1 * fit), injuryRisk: clamp(f.injuryRisk / 100, 0.03, 0.95) * ageInjuryMult(age) * (prep.intensity === 'intense' ? 1.2 : 1),
    reach: f.reachCm, age, home: opts.home,
    sharp: clamp(0.94 + 0.12 * conf0 + 0.02 * camp, 0.85, 1.1),
  }
  // Training focus pays off in camp: up to ~+4% on the focused attributes.
  for (const k of FOCUS_ATTRS[f.trainingFocus] ?? []) sim[k] = clamp(sim[k] * (1 + 0.04 * camp), 0.01, 1)
  // Experience compensates for physical decline: veterans read the fight better.
  sim.iq = clamp(sim.iq * (1 + 0.04 * sim.exp * (age >= 30 ? 1 : 0.5)), 0.01, 1)
  // Plan: temporary tactical lean.
  if (prep.plan === 'aggressive') { sim.agg = clamp(sim.agg + 0.12, 0, 1); sim.def = clamp(sim.def - 0.04, 0, 1) }
  if (prep.plan === 'cautious') { sim.agg = clamp(sim.agg - 0.12, 0, 1); sim.def = clamp(sim.def + 0.04, 0, 1) }
  return sim
}

export function roundsFor(repA: number, repB: number, fightsA: number, fightsB: number): number {
  const rep = Math.max(repA, repB)
  const exp = Math.min(fightsA, fightsB)
  if (exp < 4) return 4
  if (exp < 8 && rep < 40) return 6
  if (rep >= 60 && exp >= 12) return 12
  if (rep >= 40 || exp >= 15) return 10
  return 8
}

export function divisionLabel(id: WeightClassId): string { return weightClass(id).name }
