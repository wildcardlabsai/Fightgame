/**
 * MANAGERS AND AMBITIONS. Both are HIDDEN truths, derived on demand from the seed, the fighter and public career facts — never stored,
 * so they cannot leak through state and cannot drift. The player learns them only through the talks (see `told` tags on a Talk and
 * `BusinessState.learned`), exactly as a real promoter learns a manager's agenda.
 */
import { weightClassLabel } from '../../data/weightClasses'
import { fighterAge } from '../fighters'
import { keyedRng } from '../rng'
import { titlesHeldBy } from '../media/titles'
import { primaryRank } from '../media/worldEvents'
import type { Fighter, GameState, Id } from '../types'
import type { PathwayKind } from './types'
import { LEVEL_ORDER, levelOf, levelRank, TITLE_DEFS, isEligibleFor, type TitleLevel } from './titleDefs'

export type ManagerArchetype =
  | 'MONEY_FOCUSED' | 'TITLE_FOCUSED' | 'ACTIVITY_FOCUSED' | 'EXPOSURE_FOCUSED' | 'CAREER_FOCUSED'
  | 'LOYAL' | 'AGGRESSIVE' | 'CAUTIOUS' | 'DEVELOPMENT_FOCUSED'

export const ARCHETYPES: ManagerArchetype[] = ['MONEY_FOCUSED', 'TITLE_FOCUSED', 'ACTIVITY_FOCUSED', 'EXPOSURE_FOCUSED', 'CAREER_FOCUSED', 'LOYAL', 'AGGRESSIVE', 'CAUTIOUS', 'DEVELOPMENT_FOCUSED']

/** What each priority is called when a manager lets it slip. The player never sees the archetype name. */
export const PRIORITY_LABEL: Record<Priority, string> = {
  money: 'the financial package', title: 'a clear route to a title', activity: 'regular fights', exposure: 'big stages and television',
  career: 'the long-term plan', loyalty: 'a relationship they can trust', development: 'careful, steady development', security: 'security and guarantees',
}
export type Priority = 'money' | 'title' | 'activity' | 'exposure' | 'career' | 'loyalty' | 'development' | 'security'

export interface Manager {
  name: string
  archetype: ManagerArchetype
  /** Priority weights 0–1 (HIDDEN). */
  weights: Record<Priority, number>
  /** Hidden bargaining traits 0–1. */
  walkAway: number
  patience: number
  lowballTolerance: number
  /** How readily they counter instead of simply saying no. */
  counters: number
}

const FIRST = ['Gary', 'Neil', 'Dennis', 'Marcus', 'Colin', 'Ray', 'Stuart', 'Terry', 'Alan', 'Paul', 'Harvey', 'Leon', 'Vince', 'Dominic', 'Grant', 'Sean', 'Mick', 'Roy', 'Clive', 'Eddie', 'Tony', 'Brian', 'Frank', 'Lloyd']
const LAST = ['Whitlow', 'Cartwright', 'Bellamy', 'Okoro', 'Harkness', 'Pryor', 'Lennard', 'Voss', 'Duggan', 'Marlow', 'Fairclough', 'Sandhu', 'Keane', 'Tolliver', 'Brody', 'Haskell', 'Rennick', 'Moorcroft', 'Ashdown', 'Delaney', 'Garrity', 'Pellegrino', 'Stanton', 'Yardley']

const BASE: Record<ManagerArchetype, Record<Priority, number>> = {
  MONEY_FOCUSED: { money: 0.95, title: 0.3, activity: 0.3, exposure: 0.4, career: 0.3, loyalty: 0.2, development: 0.2, security: 0.5 },
  TITLE_FOCUSED: { money: 0.45, title: 0.95, activity: 0.4, exposure: 0.5, career: 0.6, loyalty: 0.3, development: 0.4, security: 0.3 },
  ACTIVITY_FOCUSED: { money: 0.4, title: 0.4, activity: 0.95, exposure: 0.4, career: 0.4, loyalty: 0.4, development: 0.5, security: 0.5 },
  EXPOSURE_FOCUSED: { money: 0.5, title: 0.4, activity: 0.4, exposure: 0.95, career: 0.5, loyalty: 0.2, development: 0.3, security: 0.3 },
  CAREER_FOCUSED: { money: 0.45, title: 0.7, activity: 0.5, exposure: 0.5, career: 0.95, loyalty: 0.4, development: 0.6, security: 0.4 },
  LOYAL: { money: 0.4, title: 0.4, activity: 0.5, exposure: 0.3, career: 0.5, loyalty: 0.95, development: 0.5, security: 0.7 },
  AGGRESSIVE: { money: 0.7, title: 0.7, activity: 0.4, exposure: 0.6, career: 0.5, loyalty: 0.2, development: 0.2, security: 0.3 },
  CAUTIOUS: { money: 0.5, title: 0.3, activity: 0.5, exposure: 0.2, career: 0.5, loyalty: 0.6, development: 0.7, security: 0.9 },
  DEVELOPMENT_FOCUSED: { money: 0.3, title: 0.5, activity: 0.6, exposure: 0.2, career: 0.8, loyalty: 0.5, development: 0.95, security: 0.6 },
}

const TRAITS: Record<ManagerArchetype, { walkAway: number; patience: number; lowball: number; counters: number }> = {
  MONEY_FOCUSED: { walkAway: 0.6, patience: 0.45, lowball: 0.2, counters: 0.7 },
  TITLE_FOCUSED: { walkAway: 0.5, patience: 0.55, lowball: 0.5, counters: 0.8 },
  ACTIVITY_FOCUSED: { walkAway: 0.4, patience: 0.6, lowball: 0.5, counters: 0.85 },
  EXPOSURE_FOCUSED: { walkAway: 0.5, patience: 0.5, lowball: 0.45, counters: 0.75 },
  CAREER_FOCUSED: { walkAway: 0.35, patience: 0.7, lowball: 0.55, counters: 0.9 },
  LOYAL: { walkAway: 0.25, patience: 0.8, lowball: 0.6, counters: 0.9 },
  AGGRESSIVE: { walkAway: 0.8, patience: 0.3, lowball: 0.15, counters: 0.5 },
  CAUTIOUS: { walkAway: 0.35, patience: 0.65, lowball: 0.4, counters: 0.8 },
  DEVELOPMENT_FOCUSED: { walkAway: 0.3, patience: 0.75, lowball: 0.6, counters: 0.9 },
}

function archetypeWeights(f: Fighter, age: number, seed: string): [ManagerArchetype, number][] {
  const w: Record<ManagerArchetype, number> = { MONEY_FOCUSED: 1, TITLE_FOCUSED: 1, ACTIVITY_FOCUSED: 1, EXPOSURE_FOCUSED: 1, CAREER_FOCUSED: 1, LOYAL: 1, AGGRESSIVE: 1, CAUTIOUS: 1, DEVELOPMENT_FOCUSED: 1 }
  const bump = (a: ManagerArchetype, v: number) => { w[a] += v }
  switch (f.personality) {
    case 'Greedy': bump('MONEY_FOCUSED', 3); bump('AGGRESSIVE', 1); break
    case 'Ambitious': bump('TITLE_FOCUSED', 2.5); bump('CAREER_FOCUSED', 1.5); break
    case 'Loyal': bump('LOYAL', 3); bump('CAUTIOUS', 1); break
    case 'Showman': bump('EXPOSURE_FOCUSED', 3); bump('MONEY_FOCUSED', 1); break
    case 'Professional': bump('CAREER_FOCUSED', 2); bump('ACTIVITY_FOCUSED', 1.5); break
    case 'Quiet': case 'Humble': bump('CAUTIOUS', 1.5); bump('DEVELOPMENT_FOCUSED', 1.5); break
    case 'Arrogant': bump('AGGRESSIVE', 2.5); bump('TITLE_FOCUSED', 1.5); break
    case 'Fragile': bump('CAUTIOUS', 2.5); bump('DEVELOPMENT_FOCUSED', 1); break
    case 'Volatile': bump('AGGRESSIVE', 2.5); break
  }
  if (age <= 23) bump('DEVELOPMENT_FOCUSED', 2)
  if (age >= 33) { bump('MONEY_FOCUSED', 1.5); bump('LOYAL', 0.5) }
  void seed
  return ARCHETYPES.map((a) => [a, w[a]])
}

const cache = new Map<string, Manager>()
/** The fighter's manager. Deterministic from the seed and fighter; stable for the fighter's career (age only nudges the draw at first sight). */
export function managerOf(state: GameState, f: Fighter): Manager {
  const key = `${state.seed}|${f.id}`
  const hit = cache.get(key)
  if (hit) return hit
  const rng = keyedRng(state.seed, 'manager', f.id)
  const age = fighterAge(f, state.startDay)
  const archetype = rng.weighted(archetypeWeights(f, age, state.seed), (x) => x[1])[0]
  const jitter = (v: number) => Math.min(1, Math.max(0, v + (rng.next() - 0.5) * 0.14))
  const weights = Object.fromEntries(Object.entries(BASE[archetype]).map(([k, v]) => [k, jitter(v)])) as Record<Priority, number>
  const t = TRAITS[archetype]
  const m: Manager = { name: `${rng.pick(FIRST)} ${rng.pick(LAST)}`, archetype, weights, walkAway: jitter(t.walkAway), patience: jitter(t.patience), lowballTolerance: jitter(t.lowball), counters: jitter(t.counters) }
  if (cache.size > 4000) cache.clear()
  cache.set(key, m)
  return m
}

/** The two or three things this camp cares about most, strongest first. Hidden: surfaces only via `revealedPriorities`. */
export function topPriorities(m: Manager, n = 3): Priority[] {
  return (Object.entries(m.weights) as [Priority, number][]).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n).map((x) => x[0])
}

// -------------------------------------------------------------- Ambitions

export type AmbitionKind =
  | 'BECOME_AREA_CHAMPION' | 'BECOME_BRITISH_CHAMPION' | 'BECOME_COMMONWEALTH_CHAMPION' | 'BECOME_EUROPEAN_CHAMPION' | 'BECOME_WORLD_CHAMPION'
  | 'UNIFY_TITLES' | 'BECOME_UNDISPUTED' | 'BUILD_UNBEATEN_RECORD' | 'MAXIMISE_EARNINGS' | 'STAY_ACTIVE' | 'MOVE_UP_DIVISION'
  | 'AVENGE_LOSS' | 'FIGHT_RIVAL' | 'BUILD_LEGACY'

export interface Ambition { kind: AmbitionKind; target: Id | null; label: string }

const LABEL: Record<AmbitionKind, string> = {
  BECOME_AREA_CHAMPION: 'Win an area title', BECOME_BRITISH_CHAMPION: 'Become British champion', BECOME_COMMONWEALTH_CHAMPION: 'Become Commonwealth champion',
  BECOME_EUROPEAN_CHAMPION: 'Become European champion', BECOME_WORLD_CHAMPION: 'Become world champion', UNIFY_TITLES: 'Unify the titles',
  BECOME_UNDISPUTED: 'Become undisputed champion', BUILD_UNBEATEN_RECORD: 'Build an unbeaten record', MAXIMISE_EARNINGS: 'Maximise earnings',
  STAY_ACTIVE: 'Stay active', MOVE_UP_DIVISION: 'Move up a division', AVENGE_LOSS: 'Avenge a defeat', FIGHT_RIVAL: 'Settle a rivalry', BUILD_LEGACY: 'Build a legacy',
}
export const ambitionLabel = (k: AmbitionKind): string => LABEL[k]

/** The pathways each ambition values. A match is worth real money in a negotiation. */
export const AMBITION_PATHWAYS: Partial<Record<AmbitionKind, PathwayKind[]>> = {
  BECOME_AREA_CHAMPION: ['areaShot'], BECOME_BRITISH_CHAMPION: ['domesticShot', 'areaShot'], BECOME_COMMONWEALTH_CHAMPION: ['domesticShot'],
  BECOME_EUROPEAN_CHAMPION: ['europeanRoute', 'domesticShot'], BECOME_WORLD_CHAMPION: ['worldIfRanked', 'eliminator', 'europeanRoute'],
  UNIFY_TITLES: ['worldIfRanked', 'headline'], BECOME_UNDISPUTED: ['worldIfRanked', 'headline'], BUILD_UNBEATEN_RECORD: ['activity'],
  STAY_ACTIVE: ['activity'], BUILD_LEGACY: ['headline', 'worldIfRanked'], MAXIMISE_EARNINGS: ['headline'], FIGHT_RIVAL: ['headline'], AVENGE_LOSS: ['headline'],
}

const NEXT_LEVEL: Record<TitleLevel | 'none', AmbitionKind> = {
  none: 'BECOME_AREA_CHAMPION', area: 'BECOME_BRITISH_CHAMPION', domestic: 'BECOME_EUROPEAN_CHAMPION', european: 'BECOME_WORLD_CHAMPION', world: 'UNIFY_TITLES',
}

/** The fighter's career ambition now. Stable while their career stage is unchanged; changes when they achieve something. */
export function ambitionOf(state: GameState, f: Fighter): Ambition {
  const media = state.media
  const age = fighterAge(f, state.today)
  const fights = f.record.wins + f.record.losses + f.record.draws
  const held = media ? titlesHeldBy(media, f.id) : []
  const bestHeld: TitleLevel | 'none' = held.length ? LEVEL_ORDER[Math.max(...held.map((t) => levelRank(levelOf(t.body))))] : 'none'
  const worldBelts = held.filter((t) => levelOf(t.body) === 'world').length
  const rank = media ? primaryRank(media, f) : null
  // The most recent bout, if it was a defeat inside half a year: the loss that still stings.
  let lossTo: Id | null = null
  const lastId = f.recentFights[f.recentFights.length - 1]
  const last = lastId ? state.fights[lastId] : undefined
  if (last?.result && last.result.winner !== null && state.today - last.day <= 180) {
    const isA = last.sideA.fighterId === f.id
    if ((last.result.winner === 0) !== isA) lossTo = isA ? last.sideB.fighterId : last.sideA.fighterId
  }
  const rival = media ? Object.keys(media.rivalry).find((k) => k.split('|').includes(f.id)) : undefined
  const rivalId = rival ? rival.split('|').find((x) => x !== f.id) ?? null : null

  const stage = `${bestHeld}|${worldBelts}|${rank === null ? 'u' : rank <= 3 ? 't3' : rank <= 10 ? 't10' : 'r'}|${fights < 8 ? 'p' : fights < 20 ? 'm' : 'v'}|${age >= 34 ? 'o' : age <= 24 ? 'y' : 'a'}|${lossTo ?? ''}|${rivalId ?? ''}`
  const rng = keyedRng(state.seed, 'ambition', f.id, stage)

  const w: [AmbitionKind, number][] = []
  const add = (k: AmbitionKind, v: number) => { if (v > 0) w.push([k, v]) }
  const eligible = (id: string) => { const d = TITLE_DEFS.find((x) => x.id === id); return !!d && isEligibleFor(d, f) }
  if (worldBelts >= 2) { add('BECOME_UNDISPUTED', 5); add('BUILD_LEGACY', 2); add('MAXIMISE_EARNINGS', 1.5) }
  else if (worldBelts === 1) { add('UNIFY_TITLES', 4); add('BUILD_LEGACY', 2); add('MAXIMISE_EARNINGS', 2) }
  else {
    // The next rung of the ladder this fighter could actually climb.
    const nextLevel = NEXT_LEVEL[bestHeld]
    const climb = (rank !== null && rank <= 10) || bestHeld === 'european' ? 'BECOME_WORLD_CHAMPION' : nextLevel
    const ukBased = eligible('british')
    const euro = eligible('european')
    let target: AmbitionKind = climb
    if (climb === 'BECOME_AREA_CHAMPION') target = ukBased ? (rng.chance(0.55) ? 'BECOME_BRITISH_CHAMPION' : 'BECOME_AREA_CHAMPION') : euro ? 'BECOME_EUROPEAN_CHAMPION' : 'BECOME_WORLD_CHAMPION'
    else if (climb === 'BECOME_BRITISH_CHAMPION' && !ukBased) target = euro ? 'BECOME_EUROPEAN_CHAMPION' : 'BECOME_WORLD_CHAMPION'
    else if (climb === 'BECOME_BRITISH_CHAMPION' && eligible('commonwealth') && rng.chance(0.3)) target = 'BECOME_COMMONWEALTH_CHAMPION'
    else if (climb === 'BECOME_EUROPEAN_CHAMPION' && !euro) target = 'BECOME_WORLD_CHAMPION'
    add(target, fights < 6 ? 2.2 : 3.4)
    if (fights < 14 && f.record.losses === 0) add('BUILD_UNBEATEN_RECORD', 3)
    add('STAY_ACTIVE', fights < 12 ? 2 : 1)
    add('MAXIMISE_EARNINGS', age >= 31 ? 2.6 : 1)
    if (age >= 34) add('BUILD_LEGACY', 2.4)
    add('MOVE_UP_DIVISION', age <= 28 && f.heightCm > 0 ? 0.7 : 0)
  }
  if (lossTo) add('AVENGE_LOSS', 2.6)
  if (rivalId) add('FIGHT_RIVAL', 2.2)
  const pick = rng.weighted(w, (x) => x[1])[0]
  return { kind: pick, target: pick === 'AVENGE_LOSS' ? lossTo : pick === 'FIGHT_RIVAL' ? rivalId : null, label: LABEL[pick] }
}

/** Plain-language rendering of an ambition for the camp's own mouth (after the player has asked). */
export function ambitionLine(a: Ambition, f: Fighter, nameOf: (id: Id) => string): string {
  switch (a.kind) {
    case 'AVENGE_LOSS': return a.target ? `${f.lastName} wants another go at ${nameOf(a.target)}.` : `${f.lastName} has unfinished business.`
    case 'FIGHT_RIVAL': return a.target ? `${f.lastName} wants to settle it with ${nameOf(a.target)}.` : `${f.lastName} wants the big rivalry fight.`
    case 'MOVE_UP_DIVISION': return `${f.lastName} is outgrowing ${weightClassLabel(f.weightClass).toLowerCase()} and wants to look at the next division.`
    default: return `${LABEL[a.kind].replace(/^./, (c) => c)} — that is what ${f.lastName} is working toward.`
  }
}
