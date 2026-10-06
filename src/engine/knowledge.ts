/**
 * PLAYER KNOWLEDGE
 * ----------------
 * The engine knows every fighter's true attributes. The player does not. This module is the
 * only bridge: it turns (public facts + scouting) into *beliefs* — an Estimate {mean, sd} per trait.
 *
 *   prior   : derived ONLY from PublicFacts (record, reputation, style, age …), so it never uses hidden values
 *   report  : a noisy measurement of the true value; noise depends on scout, depth, visibility, familiarity
 *   update  : precision-weighted (Bayesian) combination of prior and every measurement
 *   decay   : uncertainty creeps back up each week, so stale reports fade
 *
 * `trueValue` is the single place hidden attributes are read for this purpose. UI code must never import it.
 */
import { BALANCE as B } from './balance'
import { ATTRIBUTE_KEYS, clamp, publicFacts, visibility, type PublicFacts } from './fighters'
import { keyedNormal } from './rng'
import type {
  Day, Estimate, Fighter, FighterKnowledge, GameState, Id, Scout, ScoutDepth, TraitKey,
} from './types'

export const SCOUT_TRAITS: TraitKey[] = [...ATTRIBUTE_KEYS, 'discipline', 'composure', 'potential']

/** ENGINE TRUTH accessor. Keep usage inside engine modules. */
export function trueValue(f: Fighter, t: TraitKey): number {
  if (t === 'potential') return f.potential
  if (t === 'discipline') return f.discipline
  if (t === 'composure') return f.composure
  return f.attributes[t]
}

// ---------------------------------------------------------------- Priors

type StyleTable = Partial<Record<PublicFacts['style'], number>>
const sty = (p: PublicFacts, t: StyleTable) => t[p.style] ?? 0

/** The player's belief about a trait before any scouting — a function of PUBLIC facts only. */
export function priorFor(p: PublicFacts, t: TraitKey): Estimate {
  const r = p.record
  const fights = r.wins + r.losses + r.draws
  const winPct = fights ? r.wins / fights : 0.5
  const koRate = r.wins ? r.koWins / r.wins : 0
  const koLoss = fights ? r.koLosses / fights : 0
  const exp = Math.min(fights, 30) / 30
  const base = 38 + p.reputation * 0.38 + (winPct - 0.5) * 22 * Math.min(1, fights / 10)
  const oldAge = Math.max(0, p.age - 32)
  let mean: number
  let sd = B.scouting.priorSd
  switch (t) {
    case 'power': mean = 45 + (koRate * 100 - 45) * 0.4 + sty(p, { Slugger: 8, 'Boxer-Puncher': 5, 'Out-Boxer': -6 }); break
    case 'chin': mean = 58 - koLoss * 60 - (oldAge > 0 ? 4 : 0); break
    case 'speed': mean = base + sty(p, { 'Out-Boxer': 7, Slugger: -6 }) - oldAge * 1.2; break
    case 'defence': mean = base + sty(p, { 'Out-Boxer': 6, 'Counter-Puncher': 6, Slugger: -6, Swarmer: -4 }); break
    case 'stamina': mean = base + sty(p, { Swarmer: 8, Slugger: -5 }) - oldAge; break
    case 'ringIQ': mean = base + sty(p, { Boxer: 6, 'Counter-Puncher': 8, Slugger: -5 }) + exp * 4; break
    case 'aggression': mean = { Swarmer: 68, Slugger: 62, 'Boxer-Puncher': 55, Boxer: 48, 'Out-Boxer': 42, 'Counter-Puncher': 38 }[p.style]; sd = 14; break
    case 'heart': mean = 50 + (winPct - 0.5) * 10 + exp * 3; break
    case 'adaptability': mean = base * 0.5 + 25 + exp * 4; break
    case 'discipline': mean = 50 + (p.age > 26 ? 3 : 0); break
    case 'composure': mean = 48 + exp * 10; break
    case 'marketability': mean = 18 + p.popularity * 0.55; sd = 12; break
    case 'potential':
      mean = base + (p.age < 27 ? (27 - p.age) * 1.7 + 3 : 0)
      sd = B.scouting.priorSdPotential
      break
  }
  return { mean: clamp(mean, 5, 95), sd }
}

// ----------------------------------------------------------- Bayesian maths

export function combine(prior: Estimate, observed: number, obsSd: number): Estimate {
  const p0 = 1 / (prior.sd * prior.sd)
  const p1 = 1 / (obsSd * obsSd)
  return {
    mean: clamp((prior.mean * p0 + observed * p1) / (p0 + p1), 1, 100),
    sd: Math.max(B.scouting.minSd, 1 / Math.sqrt(p0 + p1)),
  }
}

/** Current belief about a fighter's trait (posterior if scouted, otherwise the public prior). */
export function beliefOf(state: GameState, f: Fighter, t: TraitKey): Estimate {
  return state.knowledge[f.id]?.est[t] ?? priorFor(publicFacts(f, state.today), t)
}

// ------------------------------------------------------------- Scout skill

export function scoutAccuracy(scout: Pick<Scout, 'quality' | 'experience'>): number {
  return 0.55 + (scout.quality / 100) * 0.9 + Math.min(0.15, (scout.experience / 100) * 0.15)
}

export function traitGroup(t: TraitKey): 'physical' | 'technical' | 'mental' {
  if ((B.scouting.physicalTraits as readonly string[]).includes(t)) return 'physical'
  if ((B.scouting.mentalTraits as readonly string[]).includes(t)) return 'mental'
  return 'technical'
}

export function traitsCoveredBy(depth: ScoutDepth): TraitKey[] {
  const phys = [...B.scouting.physicalTraits] as TraitKey[]
  const tech = [...B.scouting.technicalTraits] as TraitKey[]
  const ment = [...B.scouting.mentalTraits] as TraitKey[]
  if (depth === 'basic') return [...phys, 'potential']
  if (depth === 'standard') return [...phys, ...tech, 'potential']
  return [...phys, ...tech, ...ment, 'potential']
}

/** Measurement noise for one trait of one report. Lower is better. */
export function observationSd(depth: ScoutDepth, t: TraitKey, scout: Scout, p: PublicFacts): number {
  const sc = B.scouting
  const group = t === 'potential' ? 1 : sc.traitSdMult[traitGroup(t)]
  const potential = t === 'potential' ? sc.potentialSdMult[depth] : 1
  const vis = clamp(1.35 - (visibility(p) / 100) * 0.7, 0.75, 1.3)
  const familiar = scout.regionKnowledge.includes(p.nationality) ? 0.85 : 1.1
  const special = scout.divisions.includes(p.weightClass) ? 0.9 : 1
  return (sc.obsSd[depth] * group * potential * vis * familiar * special) / scoutAccuracy(scout)
}

// ---------------------------------------------------------------- Entries

export function isDiscovered(state: GameState, id: Id): boolean {
  return id in state.knowledge
}

export function discover(state: GameState, id: Id, source: FighterKnowledge['source']): FighterKnowledge | null {
  if (state.knowledge[id]) return null
  const entry: FighterKnowledge = { fighterId: id, discoveredDay: state.today, source, est: {}, insight: 0, reports: [], observations: 0 }
  state.knowledge[id] = entry
  return entry
}

function entryFor(state: GameState, f: Fighter, source: FighterKnowledge['source'] = 'public'): FighterKnowledge {
  return state.knowledge[f.id] ?? discover(state, f.id, source)!
}

/** Fold a scouting report into the player's beliefs. */
export function applyReport(state: GameState, f: Fighter, depth: ScoutDepth, scout: Scout, label = scout.name): FighterKnowledge {
  const entry = entryFor(state, f)
  const facts = publicFacts(f, state.today)
  const idx = entry.reports.length
  for (const t of traitsCoveredBy(depth)) {
    const sd = observationSd(depth, t, scout, facts)
    const observed = clamp(trueValue(f, t) + keyedNormal(state.seed, 'report', f.id, scout.id, t, idx) * sd, 1, 100)
    entry.est[t] = combine(beliefOf(state, f, t), observed, sd)
  }
  entry.insight = Math.min(100, entry.insight + B.scouting.insightGain[depth])
  entry.reports.push({ day: state.today, depth, scoutName: label })
  if (entry.reports.length > 12) entry.reports.shift()
  return entry
}

/** Passive learning about fighters on the player's roster (daily contact in the gym). */
export function observeRoster(state: GameState, f: Fighter): void {
  const entry = entryFor(state, f, 'roster')
  for (const t of SCOUT_TRAITS) {
    const sd = t === 'potential' ? B.scouting.rosterObsPotentialSd : B.scouting.rosterObsSd
    const observed = clamp(trueValue(f, t) + keyedNormal(state.seed, 'obs', f.id, t, state.today) * sd, 1, 100)
    entry.est[t] = combine(beliefOf(state, f, t), observed, sd)
  }
  entry.insight = Math.min(100, entry.insight + 2)
  entry.observations += 1
}

/**
 * Hook for the fight engine (Phase 3): watching a fighter in the ring teaches the player more.
 * `sd` is the measurement noise of that observation (lower = a more revealing performance).
 */
export function observeFight(state: GameState, f: Fighter, sd = 9): void {
  const entry = entryFor(state, f)
  for (const t of SCOUT_TRAITS) {
    if (t === 'potential') continue
    const observed = clamp(trueValue(f, t) + keyedNormal(state.seed, 'fightobs', f.id, t, state.today, entry.observations) * sd, 1, 100)
    entry.est[t] = combine(beliefOf(state, f, t), observed, sd)
  }
  entry.insight = Math.min(100, entry.insight + 12)
  entry.observations += 1
}

/** Information goes stale: uncertainty creeps back toward the public prior's level. */
export function driftKnowledge(state: GameState): void {
  const d = B.scouting.weeklyDrift
  for (const entry of Object.values(state.knowledge)) {
    for (const t of Object.keys(entry.est) as TraitKey[]) {
      const e = entry.est[t]!
      const cap = t === 'potential' ? B.scouting.priorSdPotential : t === 'marketability' ? 12 : B.scouting.priorSd
      e.sd = Math.min(cap, Math.sqrt(e.sd * e.sd + d * d))
    }
  }
}

// -------------------------------------------------------------- Presentation

export type TraitLabel = 'Poor' | 'Below Average' | 'Average' | 'Good' | 'Excellent'

export function labelFor(mean: number): TraitLabel {
  if (mean < 35) return 'Poor'
  if (mean < 48) return 'Below Average'
  if (mean < 60) return 'Average'
  if (mean < 72) return 'Good'
  return 'Excellent'
}

export interface Range { lo: number; hi: number; mid: number }

/** Convert a belief into a display range. Never degenerate: always at least `minRangeWidth` wide. */
export function toRange(e: Estimate): Range {
  const half = Math.max(B.scouting.minRangeWidth / 2, e.sd * B.scouting.rangeZ)
  let lo = Math.max(1, Math.floor(e.mean - half))
  let hi = Math.min(100, Math.ceil(e.mean + half))
  if (hi - lo < B.scouting.minRangeWidth) {
    if (lo === 1) hi = lo + B.scouting.minRangeWidth
    else lo = hi - B.scouting.minRangeWidth
  }
  return { lo, hi, mid: Math.round(e.mean) }
}

/** Combine several beliefs (weighted mean of independent estimates). */
export function blend(parts: { e: Estimate; w: number }[]): Estimate {
  const wsum = parts.reduce((s, p) => s + p.w, 0)
  const mean = parts.reduce((s, p) => s + p.e.mean * p.w, 0) / wsum
  const variance = parts.reduce((s, p) => s + (p.w / wsum) ** 2 * p.e.sd ** 2, 0)
  return { mean, sd: Math.sqrt(variance) }
}

export type KnowledgeLevel = 'Unknown' | 'Rumour' | 'Basic' | 'Detailed' | 'Comprehensive'

/** How well the player knows a fighter overall, from average residual uncertainty. */
export function knowledgeLevel(state: GameState, f: Fighter): { level: KnowledgeLevel; confidence: 'Low' | 'Medium' | 'High' } {
  const entry = state.knowledge[f.id]
  if (!entry || Object.keys(entry.est).length === 0) return { level: entry ? 'Rumour' : 'Unknown', confidence: 'Low' }
  const core: TraitKey[] = ['power', 'speed', 'stamina', 'chin', 'defence', 'ringIQ']
  const sds = core.map((t) => beliefOf(state, f, t).sd)
  const avg = sds.reduce((a, b) => a + b, 0) / sds.length
  if (avg > 12.5) return { level: 'Basic', confidence: 'Low' }
  if (avg > 7.5) return { level: 'Basic', confidence: 'Medium' }
  if (avg > 4.5) return { level: 'Detailed', confidence: 'Medium' }
  return { level: 'Comprehensive', confidence: 'High' }
}

export type PersonalityReveal = 'unknown' | 'hint' | 'revealed'

export function personalityReveal(insight: number): PersonalityReveal {
  return insight >= 70 ? 'revealed' : insight >= 35 ? 'hint' : 'unknown'
}

export function dayWeeksAgo(today: Day, d: Day | null): number | null {
  return d === null ? null : Math.floor((today - d) / 7)
}
