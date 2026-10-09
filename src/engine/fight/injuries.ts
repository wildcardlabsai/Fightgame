import { planInjuryMult } from '../business/plans'
import { coachInjury } from '../office/trainer'
import { BALANCE as B } from '../balance'
import { fighterAge, fighterName } from '../fighters'
import { postMessage } from '../messages'
import type { Rng } from '../rng'
import type { CampIntensity, Day, Fighter, GameState, Injury, InjurySeverity } from '../types'
import { ageInjuryMult } from './profile'

const KINDS: [string, number][] = [
  ['cut', 3], ['broken hand', 2.2], ['rib injury', 1.6], ['eye damage', 1.2], ['concussion', 1.4], ['shoulder strain', 1.6], ['ankle sprain', 1.2], ['back strain', 1.0],
]

function pickKind(rng: Rng): string {
  return rng.weighted(KINDS, (k) => k[1])[0]
}

function severityFor(rng: Rng, minimum: InjurySeverity = 'minor'): InjurySeverity {
  const w = B.fights.injury.severity
  const r = rng.next()
  let sev: InjurySeverity = r < w.minor ? 'minor' : r < w.minor + w.moderate ? 'moderate' : 'serious'
  if (minimum === 'moderate' && sev === 'minor') sev = 'moderate'
  return sev
}

function makeInjury(rng: Rng, today: Day, sev: InjurySeverity, kind?: string): Injury {
  const [lo, hi] = B.fights.injury.weeks[sev]
  return { kind: kind ?? pickKind(rng), severity: sev, startDay: today, returnDay: today + rng.int(lo, hi) * 7 }
}

/** Injury risk after a fight from damage taken, knockdowns, age and the fighter's proneness. */
export function rollFightInjury(state: GameState, f: Fighter, endDamage: number, kdSuffered: number, forced: boolean, rng: Rng): Injury | null {
  const I = B.fights.injury
  if (forced) return makeInjury(rng, state.today, severityFor(rng, 'moderate'), rng.pick(['cut', 'broken hand', 'eye damage', 'shoulder strain']))
  const age = fighterAge(f, state.today)
  const p = (I.base + I.perDamage * Math.min(1, endDamage) + I.perKnockdown * kdSuffered + I.perAgeOver30 * Math.max(0, age - 30)) * (I.riskMult + (f.injuryRisk / 100) * 0.8)
  if (!rng.chance(p * planInjuryMult(state, f.id))) return null
  return makeInjury(rng, state.today, severityFor(rng))
}

/** Weekly injury chance in training camp. Intense camps and fragile bodies get hurt more. */
export function rollCampInjury(state: GameState, f: Fighter, intensity: CampIntensity, rng: Rng): Injury | null {
  const mult = intensity === 'intense' ? 1.8 : intensity === 'light' ? 0.5 : 1
  const age = fighterAge(f, state.today)
  const mine = f.contractId ? state.contracts[f.contractId]?.promotionId === state.playerPromotionId : false
  const p = B.fights.injury.campWeekly * mult * (0.5 + f.injuryRisk / 100) * ageInjuryMult(age) * (mine ? coachInjury(state) : 1)
  if (!rng.chance(p)) return null
  return makeInjury(rng, state.today, severityFor(rng))
}

/** Injuries heal on schedule; the player is told when their fighters are back. */
export function processInjuries(state: GameState): void {
  for (const f of Object.values(state.fighters)) {
    if (f.status !== 'active') continue
    if (f.injury && f.injury.returnDay <= state.today) {
      const mine = f.contractId ? state.contracts[f.contractId]?.promotionId === state.playerPromotionId : false
      f.fitness = Math.max(40, f.fitness - 6) // lost conditioning while out
      if (mine) {
        postMessage(state, {
          from: 'Medical', category: 'fighter', priority: 'normal', key: `healed-${f.id}-${f.injury.startDay}`, cooldownWeeks: 4,
          subject: `${fighterName(f)} is fit again`,
          body: `${fighterName(f)} has recovered from the ${f.injury.kind} and is cleared to train and fight.`,
          link: { kind: 'fighter', id: f.id },
        })
      }
      f.injury = null
    }
    if (f.suspendedUntil !== null && f.suspendedUntil <= state.today) f.suspendedUntil = null
  }
}

export const SEVERITY_LABEL: Record<InjurySeverity, string> = { minor: 'Minor', moderate: 'Moderate', serious: 'Serious' }
