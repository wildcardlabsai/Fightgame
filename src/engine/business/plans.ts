/**
 * DEVELOPMENT PLANS. The player chooses how a fighter on the roster is steered: protected (build slowly, soft opposition),
 * normal, or accelerated (fast track, hard opposition). Plans are NEGOTIATED with the camp (a prospect’s manager may insist on
 * protection; an ambitious contender wants the fast track) and they really change the game:
 *
 *  - matchmaking: a protected fighter's camp refuses opponents much stronger than their man; an accelerated one accepts them (fightTalks)
 *  - fame: wins on the fast track bring more fame; protected fighters build it slowly (applied when a result is settled)
 *  - growth: protected development is a little faster for the young; the fast track burns through ring wear (injury risk) and
 *    hits morale harder after a defeat
 *  - fit: a plan that matches the fighter's career stage and ambition lifts morale and the relationship week by week;
 *    a mismatch erodes them — and a fighter on a plan that contradicts their ambition says so at the table.
 *
 * Everything is bounded and deterministic; nothing here reads potential (it is judged on public stage, age and ambition).
 */
import { coachGrowth } from '../office/trainer'
import { strategyGrowth } from '../office/strategy'
import { fighterAge, totalFights } from '../fighters'
import type { Fighter, GameState, Id } from '../types'
import { ambitionOf, type AmbitionKind } from './manager'
import { negStage, type NegStage } from './stage'
import { biz } from './talkCore'
import type { DevPlan } from './types'

export const PLAN_LABEL: Record<DevPlan, string> = { protected: 'Protected', normal: 'Steady', accelerated: 'Fast track' }
export const PLAN_BLURB: Record<DevPlan, string> = {
  protected: 'Softer opposition, steady build. Slower fame, faster development for the young, fewer injuries.',
  normal: 'A balanced path: opponents matched to standing.',
  accelerated: 'Step up quickly. More fame from wins, harder opposition, higher injury risk, heavier damage to morale after a loss.',
}

export function planOf(state: GameState, id: Id): DevPlan {
  return state.business?.plans[id] ?? 'normal'
}

/** Multipliers a plan applies. Pure and bounded. */
export function planFactors(plan: DevPlan): { growth: (young: boolean) => number; fame: number; injury: number; lossMorale: number; oppTolerance: number } {
  switch (plan) {
    case 'protected': return { growth: (y) => (y ? 1.1 : 0.97), fame: 0.85, injury: 0.9, lossMorale: 0.85, oppTolerance: 8 }
    case 'accelerated': return { growth: () => 1.0, fame: 1.2, injury: 1.12, lossMorale: 1.45, oppTolerance: 28 }
    default: return { growth: () => 1, fame: 1, injury: 1, lossMorale: 1, oppTolerance: 16 }
  }
}

const PLAN_WANTED: Partial<Record<AmbitionKind, DevPlan>> = {
  BUILD_UNBEATEN_RECORD: 'protected', STAY_ACTIVE: 'normal', MAXIMISE_EARNINGS: 'normal', BECOME_WORLD_CHAMPION: 'accelerated', BECOME_EUROPEAN_CHAMPION: 'accelerated',
  UNIFY_TITLES: 'accelerated', BECOME_UNDISPUTED: 'accelerated', AVENGE_LOSS: 'accelerated', FIGHT_RIVAL: 'accelerated', BUILD_LEGACY: 'normal',
  BECOME_AREA_CHAMPION: 'normal', BECOME_BRITISH_CHAMPION: 'normal', BECOME_COMMONWEALTH_CHAMPION: 'normal', MOVE_UP_DIVISION: 'normal',
}

const STAGE_WANTED: Record<NegStage, DevPlan> = { prospect: 'protected', journeyman: 'normal', contender: 'accelerated', champion: 'normal', star: 'normal', veteran: 'accelerated' }

export interface PlanFit { score: number; recommended: DevPlan; reasons: string[] }

/** How well a plan suits this fighter, −1…+1. `reveal` controls whether the ambition-based reason may be shown (it is hidden until learned). */
export function planFit(state: GameState, f: Fighter, plan: DevPlan, reveal = false): PlanFit {
  const stage = negStage(state, f)
  const age = fighterAge(f, state.today)
  const fights = totalFights(f)
  const amb = ambitionOf(state, f)
  const reasons: string[] = []
  let want = STAGE_WANTED[stage]
  let score = 0
  // Public: age and experience.
  if (plan === 'accelerated' && fights < 5 && age <= 21) { score -= 0.45; reasons.push('Very little ring experience for a fast track') }
  if (plan === 'protected' && stage === 'prospect') { score += 0.4; reasons.push('A sensible way to build a prospect') }
  if (plan === 'protected' && (stage === 'veteran' || age >= 34)) { score -= 0.5; reasons.push('There is not time left to protect a veteran') }
  if (plan === 'accelerated' && (stage === 'contender' || stage === 'veteran')) { score += 0.35; reasons.push('A contender needs to move up') }
  if (plan === 'protected' && stage === 'contender') { score -= 0.3; reasons.push('A contender kept in soft fights loses ground') }
  if (plan === 'accelerated' && stage === 'champion') { score -= 0.1 }
  // Hidden: ambition (shown only when the player has learned it).
  const ambWant = PLAN_WANTED[amb.kind]
  if (ambWant) {
    if (ambWant === plan) { score += 0.35; if (reveal) reasons.push('Fits what the fighter wants from the sport') }
    else if ((ambWant === 'accelerated' && plan === 'protected') || (ambWant === 'protected' && plan === 'accelerated')) { score -= 0.35; if (reveal) reasons.push('Cuts across what the fighter wants from the sport') }
    if (stage !== 'prospect') want = ambWant
  }
  return { score: Math.max(-1, Math.min(1, score)), recommended: want, reasons }
}

export function setPlan(state: GameState, id: Id, plan: DevPlan): void {
  const b = biz(state)
  if (plan === 'normal') delete b.plans[id]; else b.plans[id] = plan
}

/** Weekly: fit nudges morale and relationship; plans of fighters who left the roster fall away. Bounded and deterministic. */
export function processPlans(state: GameState): void {
  const b = state.business
  if (!b) return
  for (const id of Object.keys(b.plans)) {
    const f = state.fighters[id]
    const c = f?.contractId ? state.contracts[f.contractId] : null
    if (!f || f.status !== 'active' || !c || c.promotionId !== state.playerPromotionId) { delete b.plans[id]; continue }
    const fit = planFit(state, f, b.plans[id]).score
    f.morale = Math.max(1, Math.min(100, f.morale + fit * 0.35))
    f.promoRelations[state.playerPromotionId] = Math.max(-100, Math.min(100, (f.promoRelations[state.playerPromotionId] ?? 0) + fit * 0.06))
  }
}

/** Fame / morale factors applied when a result is settled. */
export function planFightFactors(state: GameState, id: Id): { fame: number; lossMorale: number } {
  const p = state.business?.plans[id]
  if (!p) return { fame: 1, lossMorale: 1 }
  const k = planFactors(p)
  return { fame: k.fame, lossMorale: k.lossMorale }
}

/** Development multiplier for a fighter on the roster with a plan (1 for everyone else). */
export function planGrowthMult(state: GameState, f: Fighter): number {
  const c = f.contractId ? state.contracts[f.contractId] : null
  const mine = c?.promotionId === state.playerPromotionId
  const staff = mine ? coachGrowth(state) * strategyGrowth(state, f) : 1 // the coaching staff the promoter pays for, and the promotion's chosen direction
  const p = state.business?.plans[f.id]
  if (!p) return staff
  return planFactors(p).growth(fighterAge(f, state.today) <= 24) * staff
}

/** Injury multiplier on a settled result. */
export function planInjuryMult(state: GameState, id: Id): number {
  const p = state.business?.plans[id]
  return p ? planFactors(p).injury : 1
}
