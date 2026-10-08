/**
 * What the conversation screens may know. A view is built from the Talk, public facts and what the camp has CHOSEN to tell
 * (`told` tags). It never carries manager weights, ambition (until learned), satisfaction scores, the camp’s ask or reservation value,
 * patience as a number, or any hidden fighter attribute. `hiddenKeys` below is asserted absent by the hidden-information audit.
 */
import { weightClassLabel } from '../../data/weightClasses'
import { fighterAge, fighterName } from '../fighters'
import type { Fighter, FightOffer, GameState, Id, Offer } from '../types'
import { describeChange, openTalkFor, openingOffer } from './contractTalks'
import { describeFightChange, fightStakes, openFightTalkFor, planWarning } from './fightTalks'
import { ambitionOf, ambitionLabel, managerOf, PRIORITY_LABEL, type Priority } from './manager'
import { pathwayOptions } from './commitments'
import { PLAN_BLURB, PLAN_LABEL, planFit, planOf } from './plans'
import { negStage, STAGE_LABEL } from './stage'
import { tension } from './talkCore'
import { expectedContractTerms, expectedFightTerms, type ExpectedContractTerms, type ExpectedFightTerms } from './terms'
import type { DevPlan, Talk, TalkLine } from './types'

export const HIDDEN_VIEW_KEYS = ['weights', 'walkAway', 'lowballTolerance', 'reservation', 'sat', 'patience', 'p0', 'archetype', 'potential', 'attributes', 'discipline', 'composure', 'injuryRisk', 'personalityNote'] as const

const relLabel = (r: number): string => (r >= 40 ? 'Warm' : r >= 12 ? 'Friendly' : r > -12 ? 'Neutral' : r > -35 ? 'Cool' : 'Hostile')

export interface TalkHeader {
  talkId: string
  fighterId: Id
  name: string
  age: number
  division: string
  record: string
  stage: string
  managerName: string
  relationship: string
  mood: Talk['mood']
  tension: 'Calm' | 'Rising' | 'Tense'
  turn: number
  open: boolean
  status: Talk['status']
}

function header(state: GameState, t: Talk, f: Fighter): TalkHeader {
  const mgr = managerOf(state, f)
  return {
    talkId: t.id, fighterId: f.id, name: fighterName(f), age: fighterAge(f, state.today), division: weightClassLabel(f.weightClass), record: `${f.record.wins}-${f.record.losses}-${f.record.draws}`,
    stage: STAGE_LABEL[negStage(state, f)], managerName: mgr.name, relationship: relLabel(f.promoRelations[state.playerPromotionId] ?? 0),
    mood: t.mood, tension: tension(t, t.p0), turn: t.turn, open: t.status === 'open', status: t.status,
  }
}

/** What the camp has told the player so far, in words. */
export function toldSummary(state: GameState, f: Fighter, t: Talk | undefined): { priorities: string[]; ambition: string | null } {
  const tags = new Set([...(state.business?.learned[f.id] ?? []), ...(t?.told ?? [])])
  const priorities = [...tags].filter((x) => x.startsWith('priority:')).map((x) => PRIORITY_LABEL[x.slice(9) as Priority]).filter(Boolean)
  return { priorities, ambition: tags.has('ambition') ? ambitionLabel(ambitionOf(state, f).kind) : null }
}

export interface PlanChoice { plan: DevPlan; label: string; blurb: string; fit: 'Good fit' | 'Neutral' | 'Poor fit' | 'Unknown'; why: string[] }

export function planChoices(state: GameState, f: Fighter): PlanChoice[] {
  const told = state.business?.learned[f.id]?.includes('ambition') ?? false
  return (['protected', 'normal', 'accelerated'] as DevPlan[]).map((plan) => {
    const fit = planFit(state, f, plan, told)
    const label: PlanChoice['fit'] = fit.score >= 0.25 ? 'Good fit' : fit.score <= -0.25 ? 'Poor fit' : 'Neutral'
    return { plan, label: PLAN_LABEL[plan], blurb: PLAN_BLURB[plan], fit: label, why: fit.reasons }
  })
}

export interface ContractTalkView {
  header: TalkHeader
  log: TalkLine[]
  offer: Offer | null
  counter: Offer | null
  counterChanges: string[]
  demands: string[]
  told: { priorities: string[]; ambition: string | null }
  expected: ExpectedContractTerms | null
  pathways: { kind: string; label: string; detail: string; offer: Offer['pathway'] }[]
  plans: PlanChoice[]
  currentPlan: DevPlan
  opening: Offer
  canAskAmbition: boolean
}

export function contractTalkView(state: GameState, talkId: string): ContractTalkView | null {
  const t = state.business?.talks[talkId]
  if (!t || t.kind !== 'contract') return null
  const f = state.fighters[t.fighterId]
  if (!f) return null
  const expected = expectedContractTerms(state, f.id, t.contractKind, t.offer)
  return {
    header: header(state, t, f), log: t.log.slice(), offer: t.offer, counter: t.status === 'open' ? t.counter : null,
    counterChanges: t.counter && t.offer && t.status === 'open' ? describeChange(t.offer, t.counter) : [], demands: t.demands.map((d) => d.text),
    told: toldSummary(state, f, t), expected, pathways: pathwayOptions(state, f).map((p) => ({ kind: p.offer.kind, label: p.label, detail: p.detail, offer: p.offer })),
    plans: planChoices(state, f), currentPlan: planOf(state, f.id), opening: openingOffer(state, f, t.contractKind),
    canAskAmbition: !(state.business?.learned[f.id]?.includes('ambition')),
  }
}

export interface FightTalkView {
  header: TalkHeader
  log: TalkLine[]
  offer: FightOffer | null
  counter: FightOffer | null
  counterChanges: string[]
  demands: string[]
  told: { priorities: string[]; ambition: string | null }
  expected: ExpectedFightTerms | null
  stake: { kind: string; label: string; level: string | null }
  warning: string | null
  roundsOptions: number[]
  rounds: number
}

export function fightTalkView(state: GameState, talkId: string): FightTalkView | null {
  const t = state.business?.talks[talkId]
  if (!t || t.kind !== 'fight' || !t.fightId) return null
  const fight = state.fights[t.fightId]
  const f = state.fighters[t.fighterId]
  if (!fight || !f) return null
  const st = fightStakes(state, fight)
  const label = st.kind === 'standard' ? 'A standard bout' : st.kind === 'eliminator' ? 'A title eliminator' : st.kind === 'unification' ? 'A unification fight' : 'A title fight'
  const rounds = fight.scheduledRounds
  const roundsOptions = st.level === 'world' || st.level === 'european' ? [12] : st.level ? [10, 12] : [4, 6, 8, 10]
  const expected = expectedFightTerms(state, fight.id, t.fightOffer)
  return {
    header: header(state, t, f), log: t.log.slice(), offer: t.fightOffer, counter: t.status === 'open' ? t.fightCounter : null,
    counterChanges: t.fightCounter && t.fightOffer && t.status === 'open' ? describeFightChange(t.fightOffer, t.fightCounter) : [], demands: t.demands.map((d) => d.text),
    told: toldSummary(state, f, t), expected, stake: { kind: st.kind, label, level: st.level }, warning: planWarning(state, fight), roundsOptions, rounds,
  }
}

export const openContractTalkId = (state: GameState, fighterId: Id, kind: 'signing' | 'renewal'): string | null => openTalkFor(state, fighterId, kind)?.id ?? null
export const openFightTalkId = (state: GameState, fightId: Id): string | null => openFightTalkFor(state, fightId)?.id ?? null

/** How the current DRAFT compares with the public ranges (the same words the panel uses for the last offer sent). */
export const assessContractDraft = (state: GameState, fighterId: Id, kind: 'signing' | 'renewal', offer: Offer) => expectedContractTerms(state, fighterId, kind, offer)?.assessment ?? 'Not yet judged'
export const assessFightDraft = (state: GameState, fightId: Id, offer: FightOffer) => expectedFightTerms(state, fightId, offer)?.assessment ?? 'Not yet judged'
