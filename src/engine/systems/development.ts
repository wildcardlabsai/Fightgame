import { birthdayInWeek } from '../calendar'
import { FEATURES } from '../config'
import { ATTRIBUTE_KEYS, clamp, fighterAge, fighterRating, totalFights } from '../fighters'
import { postMessage } from '../messages'
import type { Rng } from '../rng'
import type { AttributeKey, Fighter, GameState, TrainingFocus } from '../types'
import { BALANCE as B } from '../balance'

const FOCUS_ATTRS: Record<TrainingFocus, AttributeKey[]> = {
  balanced: [],
  recovery: [],
  power: ['power', 'aggression'],
  speed: ['speed', 'adaptability'],
  defence: ['defence', 'chin'],
  stamina: ['stamina', 'heart'],
  technique: ['ringIQ', 'adaptability', 'defence'],
}

export const FOCUS_LABELS: Record<TrainingFocus, string> = {
  balanced: 'Balanced', power: 'Power', speed: 'Speed & Movement', defence: 'Defence & Durability',
  stamina: 'Stamina & Heart', technique: 'Ring Craft', recovery: 'Rest & Recovery',
}

export const FOCUS_BLURBS: Record<TrainingFocus, string> = {
  balanced: 'Even development across all attributes.',
  power: 'Faster gains in Power and Aggression; other areas slow slightly.',
  speed: 'Faster gains in Speed and Adaptability.',
  defence: 'Faster gains in Defence and Chin.',
  stamina: 'Faster gains in Stamina and Heart.',
  technique: 'Faster gains in Ring IQ, Adaptability and Defence.',
  recovery: 'Slows development, but restores fitness and morale faster.',
}

/** Fraction of a full-speed growth week this fighter gets at their age. */
export function ageGrowthFactor(age: number): number {
  if (age <= 20) return 1.0
  if (age <= 24) return 0.8
  if (age <= 28) return 0.35
  if (age <= 31) return 0.05
  return 0
}

/** Age at which each physical trait starts to decline. Mental/craft traits hold up far longer. */
export const DECLINE_ONSET: Partial<Record<AttributeKey, number>> = { speed: 29, stamina: 30, chin: 31, power: 33 }

export function developFighter(f: Fighter, today: number, rng: Rng, growthMult = 1): void {
  if (f.status !== 'active') return
  const age = fighterAge(f, today)
  const room = clamp(f.potential - fighterRating(f), 0, 40)
  const growth = ageGrowthFactor(age) * (room / 40) * 0.25 * growthMult
  const focus = FOCUS_ATTRS[f.trainingFocus]
  const focused = focus.length > 0
  const moraleFactor = 0.7 + (f.morale / 100) * 0.5 // unhappy fighters train poorly
  const fitnessFactor = 0.7 + (f.fitness / 100) * 0.4

  for (const k of ATTRIBUTE_KEYS) {
    if (k === 'marketability') continue
    let mult = 1
    if (f.trainingFocus === 'recovery') mult = 0.4
    else if (focused) mult = focus.includes(k) ? 2.1 : 0.8
    const jitter = rng.float(0.5, 1.5)
    let delta = growth * mult * jitter * moraleFactor * fitnessFactor
    const onset = DECLINE_ONSET[k]
    if (onset !== undefined && age >= onset) delta -= Math.min(age - onset + 1, 8) * 0.0065 * rng.float(0.5, 1.5)
    // Experience: ring craft and heart keep improving a little into the early thirties.
    if ((k === 'ringIQ' || k === 'heart') && age >= 27 && age <= 34 && f.attributes[k] < f.potential + 4) delta += 0.004 * rng.float(0.5, 1.5)
    // A veteran can still sharpen ring craft slightly; nobody grows past their ceiling.
    f.attributes[k] = clamp(f.attributes[k] + delta, 1, Math.max(f.attributes[k], f.potential + 4))
  }
}

export function updateCondition(f: Fighter, today: number): void {
  if (f.status !== 'active') return
  const age = fighterAge(f, today)
  const heavy = f.trainingFocus !== 'balanced' && f.trainingFocus !== 'recovery'
  const fitnessTarget = f.trainingFocus === 'recovery' ? 94 : heavy ? 80 : 86
  const fitnessSpeed = f.trainingFocus === 'recovery' ? 0.2 : 0.08
  f.fitness = clamp(f.fitness + (fitnessTarget - f.fitness) * fitnessSpeed - (age > 33 ? 0.1 : 0), 1, 100)

  const condTarget = f.trainingFocus === 'recovery' ? 70 : heavy ? 90 : 82
  f.conditioning = clamp(f.conditioning + (condTarget - f.conditioning) * 0.03, 1, 100)

  let moraleTarget = 68
  if (f.trainingFocus === 'recovery') moraleTarget += 4
  if (f.personality === 'Professional' || f.personality === 'Humble') moraleTarget += 3
  if (f.personality === 'Fragile' || f.personality === 'Volatile') moraleTarget -= 4
  if (FEATURES.fightsImplemented && f.lastFightDay !== null) {
    const idleWeeks = Math.floor((today - f.lastFightDay) / 7)
    if (idleWeeks > 16) moraleTarget -= Math.min(30, (idleWeeks - 16) * (f.personality === 'Ambitious' ? 0.9 : 0.5))
  }
  f.morale = clamp(f.morale + (moraleTarget - f.morale) * (f.trainingFocus === 'recovery' ? 0.12 : 0.06), 1, 100)

  const w = totalFights(f) ? f.record.wins / totalFights(f) : 0.5
  const confTarget = 35 + w * 40 + (f.personality === 'Arrogant' ? 12 : f.personality === 'Fragile' ? -8 : 0)
  f.confidence = clamp(f.confidence + (confTarget - f.confidence) * 0.04, 1, 100)

  const cool = B.fights.popularityCool
  const excess = f.popularity - (cool.slope * f.reputation + cool.base)
  if (excess > 0) f.popularity = clamp(f.popularity - excess * cool.rate, Math.max(1, Math.round(f.reputation * 0.4)), 100)

  if (FEATURES.fightsImplemented && f.lastFightDay !== null && (today - f.lastFightDay) / 7 > 26) {
    f.popularity = clamp(f.popularity - 0.04, Math.max(1, Math.round(f.reputation * 0.4)), 100)
  }
}

/** Birthday notices for the player's fighters at milestone ages. */
export function birthdayMessages(state: GameState, f: Fighter): void {
  if (!birthdayInWeek(f.birthDay, state.today)) return
  const age = fighterAge(f, state.today)
  if (age === 21 || age === 30 || age === 35 || age === 38) {
    postMessage(state, {
      from: 'Gym', category: 'fighter', priority: 'normal', key: `bday-${f.id}-${age}`, cooldownWeeks: 50,
      subject: `${f.firstName} ${f.lastName} turns ${age}`,
      body: age >= 35
        ? `${f.firstName} turned ${age} this week. At this stage of a boxing career every fight counts — and retirement is a real possibility.`
        : `${f.firstName} turned ${age} this week.`,
      link: { kind: 'fighter', id: f.id },
    })
  }
}
