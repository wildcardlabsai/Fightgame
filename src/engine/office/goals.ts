/**
 * CAREER OBJECTIVES. The promoter's side of a fighter's career: where the promotion is trying to take them, how much risk it will run
 * getting there, and what has to happen first. An objective is a matchmaking strategy, not an outcome - it never grants eligibility,
 * a ranking or a title shot. Every milestone is read from the authoritative record (fights, rankings, belts, the contender assessment
 * the title rules themselves use); the only thing stored is which objective was chosen, when, and what the promoter decided.
 *
 * The objective sets a default risk appetite (the existing development plan: protected, steady or fast track); the camp holds the
 * promoter to it. An opponent far beyond what a protected plan allows draws an objection the promoter can override at a price
 * (morale, the camp's trust), exactly as a broken promise would.
 */
import { fighterAge, totalFights } from '../fighters'
import { bodyFor } from '../business/commitments'
import { assessChallenger } from '../business/contender'
import { careerValue } from '../business/marketValue'
import { planFactors, planOf, setPlan } from '../business/plans'
import type { DevPlan } from '../business/types'
import { experienceGap, levelRank, TITLE_DEF_BY_ID, type TitleLevel } from '../business/titleDefs'
import { rankIn } from '../media/rankings'
import { titlesHeldBy } from '../media/titles'
import type { Fighter, GameState, Id } from '../types'
import { noteDecision, officeOf, once } from './state'
import type { CareerGoal, GoalKind } from './types'

export const GOAL_ORDER: GoalKind[] = ['prospect', 'regional', 'domestic', 'european', 'world', 'rebuild', 'return', 'headline', 'veteran']
export const GOAL_INFO: Record<GoalKind, { label: string; blurb: string; plan: DevPlan; level?: TitleLevel }> = {
  prospect: { label: 'Prospect development', blurb: 'Build experience and a record against fitting opposition before asking harder questions.', plan: 'protected' },
  regional: { label: 'Regional progression', blurb: 'Climb to an area title and the first national rankings.', plan: 'normal', level: 'area' },
  domestic: { label: 'Domestic title pursuit', blurb: 'Work towards a British or Commonwealth championship.', plan: 'normal', level: 'domestic' },
  european: { label: 'European-level progression', blurb: 'Take the step to continental opposition and a European title.', plan: 'accelerated', level: 'european' },
  world: { label: 'World-title contention', blurb: 'Chase a place among the world\'s leading contenders.', plan: 'accelerated', level: 'world' },
  rebuild: { label: 'Rebuilding after a defeat', blurb: 'Win again, regain confidence and standing, then look up.', plan: 'protected' },
  return: { label: 'Returning from inactivity or injury', blurb: 'Get back to full fitness and a first fight, carefully.', plan: 'protected' },
  headline: { label: 'Commercial headline development', blurb: 'Build a name that sells shows, whatever the belts say.', plan: 'normal' },
  veteran: { label: 'Veteran career management', blurb: 'Keep a long career busy and meaningful without over-reaching.', plan: 'normal' },
}

export const goalOf = (state: GameState, id: Id): CareerGoal | null => state.office?.goals[id] ?? null

/** The objective that suits where a fighter is now (offered as the default; the promoter chooses). */
export function suggestedGoal(state: GameState, f: Fighter): GoalKind {
  const n = totalFights(f), age = fighterAge(f, state.today)
  const idle = f.lastFightDay === null ? 99 : Math.floor((state.today - f.lastFightDay) / 7)
  if (f.injury || idle > 40) return 'return'
  const last = f.recentFights.map((id) => state.fights[id]).filter((x) => x?.result).slice(-1)[0]
  const lost = last?.result ? ((last.result.winner === 0) !== (last.sideA.fighterId === f.id)) && last.result.winner !== null : false
  if (lost && n >= 6) return 'rebuild'
  if (age >= 34) return 'veteran'
  if (n < 10 && age <= 25) return 'prospect'
  const media = state.media
  if (media) {
    for (const lvl of ['world', 'european', 'domestic'] as TitleLevel[]) {
      const b = bodyFor(state, f, lvl)
      if (b && assessChallenger(state, b.id, f.id).tier === 'contender') return lvl === 'world' ? 'world' : lvl === 'european' ? 'european' : 'domestic'
    }
  }
  return f.popularity >= 45 ? 'headline' : 'regional'
}

// -------------------------------------------------------------------------------------------- Progress

export interface GoalStep { label: string; detail: string; done: boolean }
export interface GoalProgress { kind: GoalKind; label: string; steps: GoalStep[]; done: number; next: GoalStep | null; obstacles: string[]; plan: DevPlan; since: number }

const bouts = (state: GameState, f: Fighter, n: number) => f.recentFights.map((id) => state.fights[id]).filter((x) => x?.result).slice(-n)
const won = (f: Fighter, x: ReturnType<typeof bouts>[number]) => x.result!.winner !== null && (x.result!.winner === 0) === (x.sideA.fighterId === f.id)
const oppRep = (f: Fighter, x: ReturnType<typeof bouts>[number]) => (x.sideA.fighterId === f.id ? x.sideB.preRep : x.sideA.preRep)
const streak = (state: GameState, f: Fighter): number => { let n = 0; for (const x of bouts(state, f, 8).reverse()) { if (won(f, x)) n++; else break } return n }
const rankTop = (state: GameState, f: Fighter, n: number): boolean => !!state.media && ['atlas', 'pioneer', 'crown', 'apex'].some((b) => { const r = rankIn(state.media!, b, f.weightClass, f.id); return r !== null && r <= n })
const holds = (state: GameState, f: Fighter, level: TitleLevel): boolean => !!state.media && titlesHeldBy(state.media, f.id).some((h) => levelRank(TITLE_DEF_BY_ID[h.body]?.level ?? 'area') >= levelRank(level))

function levelSteps(state: GameState, f: Fighter, level: TitleLevel): GoalStep[] {
  const b = bodyFor(state, f, level)
  const name = level === 'area' ? 'an area' : level === 'domestic' ? 'a domestic' : level === 'european' ? 'the European' : 'a world'
  const gap = experienceGap(level, f.record)
  const tier = b ? assessChallenger(state, b.id, f.id) : null
  const rank = b && state.media ? rankIn(state.media, b.id, f.weightClass, f.id) : null
  const limit = b ? TITLE_DEF_BY_ID[b.id].challengerLimit : 10
  return [
    { label: `Reach contender standing for ${name} title`, detail: !b ? 'No belt of this level is open to him in his division yet.' : tier!.tier === 'contender' ? 'He is a credible contender.' : tier!.tier === 'building' ? (tier!.step ?? 'Not yet a contender.') : (gap ?? 'Not yet eligible.'), done: !!tier && tier.tier === 'contender' },
    { label: `Be ranked in the top ${limit}`, detail: rank === null ? 'Not ranked by that body.' : `Currently ranked #${rank}.`, done: rank !== null && rank <= limit },
    { label: 'Earn a title opportunity', detail: 'A mandatory or eliminator slot, or a champion\'s camp agreeing to the fight.', done: !!state.business?.titleHist[f.id] && ((state.business.titleHist[f.id].won ?? 0) > 0) || !!b && !!state.media && Object.values(state.media.titles).some((t) => t.mand?.challenger === f.id || t.elim?.a === f.id || t.elim?.b === f.id) },
    { label: `Win ${name} title`, detail: holds(state, f, level) ? 'He holds one.' : 'Not yet.', done: holds(state, f, level) },
  ]
}

function stepsFor(state: GameState, f: Fighter, kind: GoalKind): GoalStep[] {
  const n = totalFights(f)
  const recent = bouts(state, f, 8)
  const beat = (rep: number) => recent.some((x) => won(f, x) && oppRep(f, x) >= rep)
  switch (kind) {
    case 'prospect': return [
      { label: 'Gain ring experience: 8 professional fights', detail: `${Math.min(n, 8)} of 8 fights.`, done: n >= 8 },
      { label: 'Build a winning record: 6 wins', detail: `${Math.min(f.record.wins, 6)} of 6 wins.`, done: f.record.wins >= 6 },
      { label: 'Beat an opponent with a name', detail: beat(25) ? 'He has beaten one.' : 'No win yet over a recognised opponent.', done: beat(25) },
      { label: 'Break into the national top 15', detail: rankTop(state, f, 15) ? 'He is on the lists.' : 'Not ranked yet.', done: rankTop(state, f, 15) },
    ]
    case 'regional': case 'domestic': case 'european': case 'world': return levelSteps(state, f, GOAL_INFO[kind].level!)
    case 'rebuild': return [
      { label: 'Win the next fight', detail: recent.length && won(f, recent[recent.length - 1]) ? 'He has won since.' : 'Still to come.', done: recent.length > 0 && won(f, recent[recent.length - 1]) },
      { label: 'Win two in a row', detail: `Current winning run: ${streak(state, f)}.`, done: streak(state, f) >= 2 },
      { label: 'Beat a credible opponent', detail: beat(28) ? 'Done.' : 'Not yet.', done: beat(28) },
    ]
    case 'return': return [
      { label: 'Be fit and clear to fight', detail: f.injury ? 'Still injured.' : f.fitness >= 70 ? 'Fit.' : 'Fitness still coming back.', done: !f.injury && f.fitness >= 70 },
      { label: 'Take a first fight back', detail: f.activeFightId ? 'A fight is booked.' : 'Nothing booked yet.', done: !!f.activeFightId || (f.lastFightDay !== null && state.today - f.lastFightDay < 12 * 7) },
      { label: 'Win the comeback fight', detail: recent.length && won(f, recent[recent.length - 1]) && f.lastFightDay !== null && state.today - f.lastFightDay < 26 * 7 ? 'Done.' : 'Not yet.', done: recent.length > 0 && won(f, recent[recent.length - 1]) && f.lastFightDay !== null && state.today - f.lastFightDay < 26 * 7 },
    ]
    case 'headline': return [
      { label: 'Popularity 40+', detail: `Popularity ${Math.round(f.popularity)}.`, done: f.popularity >= 40 },
      { label: 'Headline a show', detail: Object.values(state.events).some((e) => e.card.length && state.fights[e.card[e.card.length - 1]]?.sideA.fighterId === f.id || state.fights[e.card[e.card.length - 1]]?.sideB.fighterId === f.id) ? 'He has topped a bill.' : 'Not yet.', done: Object.values(state.events).some((e) => { const m = e.card.length ? state.fights[e.card[e.card.length - 1]] : null; return !!m && (m.sideA.fighterId === f.id || m.sideB.fighterId === f.id) }) },
      { label: 'Popularity 60+', detail: `Popularity ${Math.round(f.popularity)}.`, done: f.popularity >= 60 },
    ]
    case 'veteran': {
      const idle = f.lastFightDay === null ? 99 : Math.floor((state.today - f.lastFightDay) / 7)
      const lastYear = f.recentFights.map((id) => state.fights[id]).filter((x) => x?.result && x.day >= state.today - 365).length
      return [
        { label: 'Stay active: a fight in the last 20 weeks', detail: `${idle} weeks since his last fight.`, done: idle <= 20 },
        { label: 'Two fights in twelve months', detail: `${lastYear} in the last year.`, done: lastYear >= 2 },
        { label: 'Face a meaningful opponent', detail: bouts(state, f, 3).some((x) => oppRep(f, x) >= 40) ? 'Done.' : 'No ranked or well-known opponent lately.', done: bouts(state, f, 3).some((x) => oppRep(f, x) >= 40) },
      ]
    }
  }
}

/** What stands in the way, in terms the player already knows (injury, inactivity, a run of defeats, a contract running out). */
function obstacles(state: GameState, f: Fighter, kind: GoalKind): string[] {
  const out: string[] = []
  const idle = f.lastFightDay === null ? 99 : Math.floor((state.today - f.lastFightDay) / 7)
  if (f.injury) out.push(`Injured: out for about ${Math.max(1, Math.ceil((f.injury.returnDay - state.today) / 7))} more weeks.`)
  else if (idle > 26 && kind !== 'return') out.push(`${idle} weeks without a fight: standing is slipping.`)
  const last2 = bouts(state, f, 2)
  if (last2.length === 2 && last2.every((x) => !won(f, x) && x.result!.winner !== null)) out.push('Two defeats in a row.')
  const c = f.contractId ? state.contracts[f.contractId] : null
  if (c && c.endDay - state.today < 26 * 7) out.push(`Contract runs out in ${Math.max(1, Math.ceil((c.endDay - state.today) / 7))} weeks.`)
  const plan = planOf(state, f.id)
  const lvl = GOAL_INFO[kind].level
  if (lvl && (lvl === 'european' || lvl === 'world') && plan === 'protected') out.push('A protected plan will not take him to this level in time.')
  if (kind === 'prospect' && plan === 'accelerated') out.push('A fast track cuts across protecting a prospect.')
  return out
}

export function goalProgress(state: GameState, f: Fighter): GoalProgress | null {
  const g = goalOf(state, f.id)
  if (!g) return null
  const steps = stepsFor(state, f, g.kind)
  const done = steps.filter((s) => s.done).length
  return { kind: g.kind, label: GOAL_INFO[g.kind].label, steps, done, next: steps.find((s) => !s.done) ?? null, obstacles: obstacles(state, f, g.kind), plan: planOf(state, f.id), since: g.set }
}

// -------------------------------------------------------------------------------------------- Commands

export function setGoal(state: GameState, fighterId: Id, kind: GoalKind): { ok: boolean; error?: string } {
  const f = state.fighters[fighterId]
  const c = f?.contractId ? state.contracts[f.contractId] : null
  if (!f || !c || c.promotionId !== state.playerPromotionId || f.status !== 'active') return { ok: false, error: 'Choose one of your own fighters.' }
  const o = officeOf(state)
  if (o.goals[fighterId]?.kind === kind) return { ok: true }
  const was = o.goals[fighterId]?.kind
  o.goals[fighterId] = { kind, set: state.today }
  // The objective's risk appetite becomes the plan unless the promoter had already chosen something else deliberately.
  const wasDefault = !was || GOAL_INFO[was].plan === planOf(state, fighterId)
  if (wasDefault) setPlan(state, fighterId, GOAL_INFO[kind].plan)
  noteDecision(state, fighterId, `Objective set: ${GOAL_INFO[kind].label}${wasDefault ? ` (${GOAL_INFO[kind].plan === 'protected' ? 'protected' : GOAL_INFO[kind].plan === 'accelerated' ? 'fast track' : 'steady'} plan)` : ''}`)
  return { ok: true }
}

export function clearGoal(state: GameState, fighterId: Id): void {
  if (state.office?.goals[fighterId]) { delete state.office.goals[fighterId]; noteDecision(state, fighterId, 'Objective cleared') }
}

// -------------------------------------------------------------------------------------------- Matchmaking fit

export type FitLabel = 'Suits the plan' | 'A step up' | 'A big step up' | 'A soft touch' | 'No plan set'
export interface OpponentFit { label: FitLabel; gap: number; objection: boolean; note: string | null }

/** How an opponent sits against the fighter's risk appetite. Public in spirit: it is built from the career values the market screens already show. */
export function opponentFit(state: GameState, f: Fighter, opp: Fighter): OpponentFit {
  const plan = planOf(state, f.id)
  const gap = careerValue(state, opp) - careerValue(state, f)
  const tol = planFactors(plan).oppTolerance
  const hasGoal = !!goalOf(state, f.id)
  // Phase 5.4D: a fighter coming off a bad run is not thrown in against a much stronger man without the camp saying so, whatever the plan.
  const shaken = f.momentum <= -35 && plan !== 'accelerated'
  if (shaken && gap > tol * 1.8) return { label: 'A big step up', gap, objection: true, note: `${f.firstName} is coming off a bad run and the camp objects: this is far too big a step up right now.` }
  if (plan === 'normal' && !hasGoal) return { label: 'No plan set', gap, objection: false, note: null }
  if (gap > tol * 1.8 && plan === 'protected') return { label: 'A big step up', gap, objection: true, note: `${f.firstName}'s camp objects: this is far beyond the protected plan.` }
  if (gap > tol) return { label: 'A big step up', gap, objection: false, note: plan === 'protected' ? 'A big step up for a protected plan.' : 'A big step up from his usual level.' }
  if (gap > tol * 0.5) return { label: 'A step up', gap, objection: false, note: null }
  if (gap < -tol && plan !== 'protected') return { label: 'A soft touch', gap, objection: false, note: plan === 'accelerated' ? 'Too soft for a fast track.' : null }
  return { label: 'Suits the plan', gap, objection: false, note: null }
}

/** Taking a fight over the camp's objection: morale and trust pay for it, once, and the decision is on the record. */
export function applyOverride(state: GameState, f: Fighter, opp: Fighter, key: string): void {
  if (!once(state, `override:${key}`)) return
  f.morale = Math.max(1, f.morale - 3)
  f.promoRelations[state.playerPromotionId] = Math.max(-100, (f.promoRelations[state.playerPromotionId] ?? 0) - 2)
  noteDecision(state, f.id, `Took on ${opp.firstName} ${opp.lastName} over the camp's objection`)
}

/** Weekly (cheap): note milestones as they are reached, once, and let a finished objective ask for the next. */
export function processGoals(state: GameState): void {
  const o = state.office
  if (!o) return
  for (const [id, g] of Object.entries(o.goals)) {
    const f = state.fighters[id]
    const c = f?.contractId ? state.contracts[f.contractId] : null
    if (!f || f.status !== 'active' || !c || c.promotionId !== state.playerPromotionId) { delete o.goals[id]; continue }
    const steps = stepsFor(state, f, g.kind)
    steps.forEach((s, i) => { if (s.done && once(state, `goal:${id}:${g.kind}:${g.set}:${i}`)) noteDecision(state, id, `Milestone reached: ${s.label}`) })
  }
}

