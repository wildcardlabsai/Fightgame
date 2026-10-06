/**
 * CAREER SCENARIOS (Phase 4.7) — data-driven starting conditions and objectives.
 *
 * Everything that makes one career different from another lives in a `CareerScenario` record. `createNewGame`
 * reads the record; the UI reads the same record to describe it. Adding a scenario means adding one object here.
 *
 * Honest notes: the engine does not gate venues or sponsors by scenario — what unlocks them is promotion
 * reputation, fanbase and cash, so a scenario "opens" them by starting with more of those. Broadcast deals are gated
 * by reputation (see balance.ts `tv`), which is why National Powerhouse can sell national TV on day one.
 */
import { baseMoney, valueOf } from './market'
import { playerRoster } from './selectors'
import type { Difficulty, GameState, PromotionTier, VenueTier } from './types'

export type ScenarioId = 'groundUp' | 'regional' | 'national' | 'champion'
export type ScenarioDifficultyLabel = 'Hard' | 'Normal' | 'Easy' | 'Expert'

export interface RosterGroup {
  /** Shown to the player, e.g. "Prospects". */
  label: string
  count: number
  /** Talent level handed to the fighter generator (0–1). Hidden attributes still follow from it. */
  quality: [number, number]
  ageMin: number
  ageMax: number
  contractYears: number
  /** Share of the going rate the opening contract was signed at (1 = market). A fighter signed before their breakout is cheaper than they would be today — renewal is the first test. */
  contractDiscount?: number
}

export type ObjectiveSpec =
  | { id: string; kind: 'valuation'; label: string; target: number }
  | { id: string; kind: 'profitableEvents'; label: string; target: number; venueTiers: VenueTier[] }
  | { id: string; kind: 'eventAtTier'; label: string; target: number; venueTiers: VenueTier[] }
  | { id: string; kind: 'risingFighter'; label: string; target: number; minWins: number }

export interface CareerScenario {
  id: ScenarioId
  name: string
  tagline: string
  description: string
  /** Shown to the player. */
  difficultyLabel: ScenarioDifficultyLabel
  /** Which engine difficulty profile applies (rival strength, costs, forecast noise). */
  difficulty: Difficulty
  startingCash: number
  tier: PromotionTier
  reputation: number
  fanbase: number
  regionalPopularity: number
  globalPopularity: number
  roster: RosterGroup[]
  /** What the starting position unlocks, in words (mirrors the engine's reputation/cash gates). */
  opens: string
  objectives: ObjectiveSpec[]
  /** 1–5 bars for the picker (relative, not raw numbers). */
  bars: { cash: number; roster: number; reputation: number; size: number }
}

export const SCENARIOS: Record<ScenarioId, CareerScenario> = {
  groundUp: {
    id: 'groundUp', name: 'From the Ground Up', tagline: 'Start with almost nothing.',
    description: 'A rented gym, a handful of raw prospects and barely enough cash. Build fighters. Build fans. Build a promotion.',
    difficultyLabel: 'Hard', difficulty: 'standard', startingCash: 300_000, tier: 'Startup', reputation: 6, fanbase: 1_200, regionalPopularity: 4, globalPopularity: 0,
    roster: [{ label: 'Raw prospects', count: 4, quality: [0.26, 0.5], ageMin: 19, ageMax: 26, contractYears: 3 }],
    opens: 'Local halls and the odd regional venue. Local TV only.',
    objectives: [{ id: 'valuation-1m', kind: 'valuation', label: 'Reach a £1m promotion valuation', target: 1_000_000 }],
    bars: { cash: 1, roster: 1, reputation: 1, size: 1 },
  },
  regional: {
    id: 'regional', name: 'Regional Promoter', tagline: 'You already have a name in town.',
    description: 'An established regional promotion with a real roster and a loyal local crowd. Dominate the region, then break into the national market.',
    difficultyLabel: 'Normal', difficulty: 'standard', startingCash: 800_000, tier: 'Regional', reputation: 24, fanbase: 28_000, regionalPopularity: 28, globalPopularity: 2,
    roster: [
      { label: 'Prospects', count: 4, quality: [0.3, 0.52], ageMin: 19, ageMax: 24, contractYears: 3 },
      { label: 'Established fighters', count: 4, quality: [0.4, 0.56], ageMin: 25, ageMax: 32, contractYears: 2 },
      { label: 'Contenders', count: 3, quality: [0.55, 0.7], ageMin: 24, ageMax: 31, contractYears: 2 },
    ],
    opens: 'Regional venues and national TV (with a strong card).',
    objectives: [{ id: 'profitable-regional-10', kind: 'profitableEvents', label: 'Run 10 profitable regional events', target: 10, venueTiers: ['regional', 'national', 'arena', 'stadium'] }],
    bars: { cash: 3, roster: 3, reputation: 3, size: 3 },
  },
  national: {
    id: 'national', name: 'National Powerhouse', tagline: 'Skip the climb.',
    description: 'A big roster, a national audience and the cash to match. Aim for arenas on day one and chase the world’s biggest promotion.',
    difficultyLabel: 'Easy', difficulty: 'forgiving', startingCash: 4_000_000, tier: 'National', reputation: 52, fanbase: 320_000, regionalPopularity: 58, globalPopularity: 22,
    roster: [
      { label: 'Prospects', count: 6, quality: [0.35, 0.6], ageMin: 19, ageMax: 24, contractYears: 3 },
      { label: 'Established fighters', count: 9, quality: [0.45, 0.62], ageMin: 25, ageMax: 33, contractYears: 2 },
      { label: 'Contenders', count: 7, quality: [0.62, 0.78], ageMin: 24, ageMax: 32, contractYears: 2 },
      { label: 'Elite fighters', count: 2, quality: [0.86, 0.94], ageMin: 25, ageMax: 30, contractYears: 3 },
    ],
    opens: 'Every venue up to the arenas, national TV, streaming and pay-per-view.',
    objectives: [{ id: 'arena-event', kind: 'eventAtTier', label: 'Run a major arena event', target: 1, venueTiers: ['arena', 'stadium'] }],
    bars: { cash: 5, roster: 5, reputation: 4, size: 4 },
  },
  champion: {
    id: 'champion', name: 'Build a Champion', tagline: 'One shot. Make it count.',
    description: 'You have one exceptional contender and not much else. Turn them into a champion and build the promotion around them — lose them and you are back to square one.',
    difficultyLabel: 'Expert', difficulty: 'brutal', startingCash: 420_000, tier: 'Startup', reputation: 16, fanbase: 9_000, regionalPopularity: 14, globalPopularity: 1,
    roster: [
      { label: 'Exceptional contender', count: 1, quality: [0.84, 0.9], ageMin: 23, ageMax: 26, contractYears: 3, contractDiscount: 0.45 },
      { label: 'Prospects', count: 4, quality: [0.28, 0.5], ageMin: 19, ageMax: 25, contractYears: 3 },
    ],
    opens: 'Local and regional venues. One name people will pay to see.',
    objectives: [{ id: 'future-champion', kind: 'risingFighter', label: 'Develop a fighter into a championship contender (reputation 70+, 15+ wins)', target: 70, minWins: 15 }],
    bars: { cash: 2, roster: 2, reputation: 2, size: 2 },
  },
}

export const SCENARIO_ORDER: ScenarioId[] = ['groundUp', 'regional', 'national', 'champion']
export const DEFAULT_SCENARIO: ScenarioId = 'groundUp'

export function scenarioById(id: string | undefined | null): CareerScenario | null {
  return id && id in SCENARIOS ? SCENARIOS[id as ScenarioId] : null
}

// -------------------------------------------------------------- Objectives

/** Runtime record kept on the game state. */
export interface ScenarioProgress { id: ScenarioId; done: Record<string, number> }

/**
 * A simple, explainable promotion valuation: cash, plus what the audience and name are worth, plus the roster's
 * market value. It is NOT a financial-engine number — only a yardstick for objectives and future unlocks.
 */
export function promotionValuation(state: GameState): number {
  const p = state.promotions[state.playerPromotionId]
  const roster = playerRoster(state).reduce((n, f) => n + baseMoney(valueOf(state, f)).purse * 3, 0)
  return Math.round(p.cash + p.fanbase * 8 + p.reputation * p.reputation * 50 + roster)
}

export interface ObjectiveStatus { id: string; label: string; value: number; target: number; done: boolean; doneDay: number | null; progressText: string }

export function objectiveStatuses(state: GameState): ObjectiveStatus[] {
  const sc = scenarioById(state.scenario?.id)
  if (!sc) return []
  const mine = Object.values(state.events).filter((e) => e.promotionId === state.playerPromotionId && e.result)
  const tierOf = (id: string) => state.venues[id]?.tier
  return sc.objectives.map((o) => {
    let value = 0
    let text = ''
    if (o.kind === 'valuation') { value = promotionValuation(state); text = `£${Math.round(value / 1000).toLocaleString('en-GB')}k of £${Math.round(o.target / 1000).toLocaleString('en-GB')}k` }
    else if (o.kind === 'profitableEvents') { value = mine.filter((e) => e.result!.profit > 0 && o.venueTiers.includes(tierOf(e.venueId) as VenueTier)).length; text = `${value} of ${o.target}` }
    else if (o.kind === 'eventAtTier') { value = mine.filter((e) => o.venueTiers.includes(tierOf(e.venueId) as VenueTier)).length; text = `${value} of ${o.target}` }
    else { value = Math.max(0, ...playerRoster(state).filter((f) => f.record.wins >= o.minWins).map((f) => f.reputation)); text = value > 0 ? `best qualified fighter: reputation ${Math.round(value)} of ${o.target}` : `no fighter with ${o.minWins}+ wins yet` }
    const doneDay = state.scenario?.done[o.id] ?? null
    return { id: o.id, label: o.label, value, target: o.target, done: doneDay !== null || value >= o.target, doneDay, progressText: text }
  })
}

/** Called weekly: stamps newly completed objectives (the caller posts the message). Returns the ones just completed. */
export function checkObjectives(state: GameState): ObjectiveStatus[] {
  if (!state.scenario) return []
  const fresh = objectiveStatuses(state).filter((s) => s.done && s.doneDay === null)
  for (const s of fresh) state.scenario.done[s.id] = state.today
  return fresh
}

