/**
 * THE TRAINER'S WORK. Technical preparation belongs to the trainer and the boxer, not the promoter: what a fighter works on in the gym,
 * how hard the camp runs and the tactical plan on the night are decided here, from the fighter's own style, condition, age and discipline.
 * The promoter's part is the business around it: the coaching staff they pay for (a promotion-wide level that changes how fast fighters
 * develop and how often camps break down), and the final say on whether a fighter goes ahead when the team reports a problem.
 *
 * Nothing here reads a fighter's hidden attributes into text the player sees: the report names what the trainer is working on and how
 * ready the camp is, in the same coarse words the rest of the roster uses.
 */
import { ATTRIBUTE_KEYS, STYLE_BIAS, fighterAge } from '../fighters'
import { weekIndex } from '../media/util'
import type { AttributeKey, CampIntensity, Fight, FightPlan, Fighter, GameState, TrainingFocus } from '../types'
import { TIER_DEFS } from '../tiers'
import type { CoachLevel } from './types'

export const COACH: Record<CoachLevel, { label: string; weekly: number; growth: number; injury: number; blurb: string }> = {
  standard: { label: 'Gym coaching', weekly: 0, growth: 1, injury: 1, blurb: 'The coaching the gym lease already covers: sound, unremarkable.' },
  quality: { label: 'Quality coaching team', weekly: 1_500, growth: 1.05, injury: 0.92, blurb: 'Experienced trainers and a conditioning coach. Fighters develop a little faster and camps break down less often.' },
  elite: { label: 'Elite coaching staff', weekly: 4_000, growth: 1.1, injury: 0.85, blurb: 'A full staff with specialists. The best development you can buy, and the most expensive.' },
}
export const COACH_ORDER: CoachLevel[] = ['standard', 'quality', 'elite']

/** Weekly cost of the coaching level at the promotion's size (the level's base price scales with the tier, like every other overhead). */
export const coachWeekly = (state: GameState, level: CoachLevel = state.office?.coach ?? 'standard'): number => Math.round(COACH[level].weekly * TIER_DEFS[state.promotions[state.playerPromotionId].tier].overheadMult)

export function coachGrowth(state: GameState): number { return COACH[state.office?.coach ?? 'standard'].growth }
export function coachInjury(state: GameState): number { return COACH[state.office?.coach ?? 'standard'].injury }

// ---------------------------------------------------------------- What the trainer works on

const GROUPS: Record<Exclude<TrainingFocus, 'balanced' | 'recovery'>, AttributeKey[]> = {
  power: ['power', 'aggression'], speed: ['speed', 'adaptability'], defence: ['defence', 'chin'], stamina: ['stamina', 'heart'], technique: ['ringIQ', 'adaptability', 'defence'],
}
export const FOCUS_WORK: Record<TrainingFocus, string> = {
  balanced: 'All-round work', power: 'Power and aggression', speed: 'Speed and movement', defence: 'Defence and durability', stamina: 'Stamina and heart', technique: 'Ring craft', recovery: 'Rest and recovery',
}

/** The trainer's choice for a fighter: the area furthest below what the fighter's own style calls for, or rest when the body needs it. */
export function trainerFocus(state: GameState, f: Fighter): { focus: TrainingFocus; why: string } {
  const age = fighterAge(f, state.today)
  const fight = f.activeFightId ? state.fights[f.activeFightId] : null
  const inCamp = !!fight && ['scheduled', 'training'].includes(fight.status) && fight.day - state.today <= 6 * 7
  if (f.injury || f.fitness < 60 || (f.morale < 30 && age >= 32)) return { focus: 'recovery', why: f.injury ? 'Recovering from injury' : 'Needs to freshen up' }
  if (inCamp) return { focus: f.attributes.stamina < 55 ? 'stamina' : 'balanced', why: 'Sharpening for the fight' }
  const mean = ATTRIBUTE_KEYS.filter((k) => k !== 'marketability').reduce((n, k) => n + f.attributes[k], 0) / (ATTRIBUTE_KEYS.length - 1)
  let best: { focus: TrainingFocus; need: number } = { focus: 'balanced', need: 4 }
  for (const [focus, attrs] of Object.entries(GROUPS) as [Exclude<TrainingFocus, 'balanced' | 'recovery'>, AttributeKey[]][]) {
    const need = attrs.reduce((n, k) => n + (mean + (STYLE_BIAS[f.style][k] ?? 0) - f.attributes[k]), 0) / attrs.length
    if (need > best.need) best = { focus, need }
  }
  return { focus: best.focus, why: best.focus === 'balanced' ? 'Nothing stands out; building evenly' : 'Closing a gap for this style' }
}

/** Weekly: the trainers of the player's roster review each fighter every sixth week (staggered by fighter, so the work is spread out). */
export function processTrainers(state: GameState): void {
  const wk = weekIndex(state)
  for (const c of Object.values(state.contracts)) {
    if (c.promotionId !== state.playerPromotionId || c.status !== 'active') continue
    const f = state.fighters[c.fighterId]
    if (!f || f.status !== 'active') continue
    let h = 0
    for (let i = 0; i < f.id.length; i++) h = (h * 31 + f.id.charCodeAt(i)) % 6
    if ((wk + h) % 6 !== 0 && !(f.injury && f.trainingFocus !== 'recovery')) continue
    const next = trainerFocus(state, f).focus
    if (next !== f.trainingFocus) f.trainingFocus = next
  }
}

// ---------------------------------------------------------------- Camp and the night

const AGGRESSIVE: Fighter['style'][] = ['Pressure Fighter', 'Swarmer', 'Power Puncher']
const CAUTIOUS: Fighter['style'][] = ['Defensive Specialist', 'Counter Puncher']

export function trainerPlan(f: Fighter): FightPlan { return AGGRESSIVE.includes(f.style) ? 'aggressive' : CAUTIOUS.includes(f.style) ? 'cautious' : 'balanced' }

export function trainerIntensity(state: GameState, f: Fighter): CampIntensity {
  const age = fighterAge(f, state.today)
  if (age >= 35 || f.fitness < 65 || f.injuryRisk >= 70) return 'light'
  if (age <= 30 && f.discipline >= 62 && f.fitness >= 78 && f.injuryRisk < 55) return 'intense'
  return 'normal'
}

/** The trainer sets the camp for a side that is the player's (at scheduling, and again when camp opens). */
export function trainerPrep(state: GameState, fight: Fight): void {
  for (const side of [fight.sideA, fight.sideB]) {
    if (side.promotionId !== state.playerPromotionId) continue
    const f = state.fighters[side.fighterId]
    if (!f) continue
    side.prep.plan = trainerPlan(f)
    side.prep.intensity = trainerIntensity(state, f)
  }
}

// ---------------------------------------------------------------- Trainer's report (what the promoter reviews)

export type Readiness = 'ready' | 'concerns' | 'notReady'
export interface TrainerReport {
  focus: string
  focusWhy: string
  camp: string
  plan: string
  readiness: Readiness
  notes: string[]
}

const INTENSITY_WORD: Record<CampIntensity, string> = { light: 'a light camp', normal: 'a standard camp', intense: 'an intense camp' }
const PLAN_WORD: Record<FightPlan, string> = { balanced: 'to fight to his natural style', aggressive: 'to press the pace and hunt the stoppage', cautious: 'to stay tight and win rounds' }

/** The trainer's view of one of the player's fighters going into a fight; null for anyone else. */
export function trainerReport(state: GameState, fight: Fight, side: 0 | 1): TrainerReport | null {
  const s = side === 0 ? fight.sideA : fight.sideB
  if (s.promotionId !== state.playerPromotionId) return null
  const f = state.fighters[s.fighterId]
  if (!f) return null
  const notes: string[] = []
  let level: Readiness = 'ready'
  const raise = (r: Readiness) => { if (r === 'notReady' || (r === 'concerns' && level === 'ready')) level = r }
  if (f.injury) { notes.push('Still carrying an injury'); raise('notReady') }
  if (s.prep.nagging) { notes.push('Nursing a niggle from camp'); raise('concerns') }
  if (s.prep.weightIssue) { notes.push('Struggling to make the weight'); raise('concerns') }
  if (f.fitness < 60) { notes.push('Fitness is well down'); raise('notReady') } else if (f.fitness < 72) { notes.push('Fitness is not where it should be'); raise('concerns') }
  if (f.morale < 30) { notes.push('Morale is very low'); raise('concerns') }
  const weeksOut = Math.max(0, Math.round((fight.day - state.today) / 7))
  if (s.prep.campWeeks < 3 && weeksOut <= 1 && fight.status !== 'agreed') { notes.push('A short camp'); raise('concerns') }
  const focus = trainerFocus(state, f)
  return { focus: FOCUS_WORK[f.trainingFocus], focusWhy: focus.why, camp: INTENSITY_WORD[s.prep.intensity], plan: PLAN_WORD[s.prep.plan], readiness: level, notes }
}
