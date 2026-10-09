/**
 * PLAYER-FACING VIEWS
 * -------------------
 * This module is the ONLY gateway from engine truth to the UI. `FighterView` contains:
 *   • public facts (record, age, reputation, popularity …)
 *   • the player's BELIEFS (ranges from scouting) — never the underlying true values
 *   • own-roster observations (coarse condition bands)
 * The UI must not import `Fighter`, read `state.fighters` or `state.knowledge` directly.
 * (Enforced by src/engine/leakAudit.test.ts.)
 */
import { FOCUS_WORK, trainerFocus } from './office/trainer'
import { rivalOfferFor, type RivalOffer } from './world/views'
import { nation } from '../data/nations'
import { weightClassLabel } from '../data/weightClasses'
import { BALANCE as B } from './balance'
import { weeksBetween } from './calendar'
import {
  fighterAge, fighterName, publicFacts, publicStage, type PublicStage,
} from './fighters'
import {
  beliefOf, blend, knowledgeLevel, labelFor, personalityReveal, toRange,
  type KnowledgeLevel, type TraitLabel,
} from './knowledge'
import {
  availabilityFor, marketTags, publicAskBand, valueOf, type AskBand,
} from './market'
import { contractStage, type ContractStage } from './systems/contracts'
import { fightAvailability, publicStanding } from './fights'
import { METHOD_SHORT } from './fight/narrative'
import { headlineRank } from './media/views'
import type {
  Estimate, Fighter, GameState, Id, Personality, ReportLogEntry, TraitKey, WeightClassId,
} from './types'

export interface RangeView { lo: number; hi: number; mid: number; label: TraitLabel }

export interface TraitView extends RangeView {
  key: string
  name: string
  /** True once a scouting report (or enough observation) has informed this estimate. */
  scouted: boolean
}

/** An own contract as the player sees it (no engine bookkeeping fields). */
export interface ContractView {
  id: Id
  startDay: number
  endDay: number
  weeklyRetainer: number
  basePurse: number
  winBonus: number
  titleBonus: number
  ppvShare: number
  signingBonus: number
  fightsTotal: number
  fightsRemaining: number
  minFightsPerYear: number
  titlePromise: boolean
}

export interface BandView { label: string; value: number }

export interface FightHistoryItem {
  fightId: Id
  day: number
  opponentId: Id
  opponentName: string
  result: 'W' | 'L' | 'D'
  method: string
  round: number
  rounds: number
}

export interface AvailabilityView {
  status: 'available' | 'booked' | 'injured' | 'suspended' | 'resting' | 'retired'
  label: string
  weeks: number | null
}

export interface NegotiationView {
  status: 'open' | 'broken'
  kind: 'signing' | 'renewal'
  rounds: number
  hasCounter: boolean
  lockedWeeks: number | null
}

export interface FighterView {
  id: Id
  name: string
  firstName: string
  lastName: string
  nickname: string | null
  nationKey: string
  nationName: string
  hometown: string
  age: number
  birthDay: number
  weightClass: WeightClassId
  division: string
  heightCm: number
  reachCm: number
  stance: string
  style: string
  status: 'active' | 'retired'
  record: { wins: number; losses: number; draws: number; koWins: number; koLosses: number }
  recordText: string
  fights: number
  koRate: number
  lastFightWeeksAgo: number | null
  stage: PublicStage
  popularity: number
  reputation: number
  discovered: boolean
  shortlisted: boolean
  bio: string

  /** Scout's overall estimate and estimate of the fighter's ceiling (potential). */
  grade: RangeView
  ceiling: RangeView
  marketability: RangeView
  traits: { physical: TraitView[]; technical: TraitView[]; mental: TraitView[] }
  knowledge: {
    level: KnowledgeLevel
    confidence: 'Low' | 'Medium' | 'High'
    reports: number
    reportLog: (ReportLogEntry & { weeksAgo: number })[]
    lastReportWeeksAgo: number | null
  }
  personality: { reveal: 'unknown' | 'hint' | 'revealed'; hint: string | null; trait: Personality | null; note: string | null }

  contract:
    | { kind: 'none' }
    | { kind: 'own'; contract: ContractView; stage: ContractStage; weeksLeft: number }
    | { kind: 'rival'; promotionId: Id; promotionName: string; approxMonthsLeft: number }
  market: {
    tags: string[]
    askBand: AskBand
    valueTier: 'Elite' | 'Premium' | 'Established' | 'Mid-market' | 'Budget'
    signable: boolean
    unavailableReason: string | null
    negotiation: NegotiationView | null
    availableWeeks: number | null
    /** A rival's offer on the table for a fighter you are aware of (who, and about when the answer comes). */
    rivalOffer: RivalOffer | null
  }
  history: { day: number; kind: Fighter['history'][number]['kind']; text: string; promotionId: Id | null }[]
  availability: AvailabilityView
  /** Last five results, oldest → newest. */
  form: ('W' | 'L' | 'D')[]
  fightHistory: FightHistoryItem[]
  momentumLabel: 'Surging' | 'Rising' | 'Steady' | 'Slipping' | 'Struggling'
  /** Public standing among active fighters in the division (not an official ranking). */
  standing: { rank: number; of: number }
  /** Phase 5: the headline media ranking ("#4", "C" for a champion) with its explanation, or empty text if unranked. */
  mediaRank: { text: string; title: string; rank: number | null }
  /** Short scout-style phrases built from beliefs (and public record when unscouted). */
  notes: string[]
  activeFightId: Id | null
  /** Only for fighters on the player's roster. */
  own: null | {
    /** What the trainer has the fighter working on, and why (the promoter does not set this). */
    workingOn: string
    workingWhy: string
    fitness: BandView
    conditioning: BandView
    confidence: BandView
    morale: BandView
    mood: string
  }
}

export interface Views {
  fighter(id: Id): FighterView | null
  /** Every fighter the player knows about (discovered), active or retired. */
  known(): FighterView[]
  mine(): FighterView[]
  freeAgents(): FighterView[]
  /** Fighters under contract with a rival, discovered only. */
  contractedElsewhere(): FighterView[]
  /** A promotion's roster is public knowledge (these are on its shows). */
  rosterOf(promotionId: Id): FighterView[]
}

// ----------------------------------------------------------------- Helpers

const range = (e: Estimate): RangeView => {
  const r = toRange(e)
  return { ...r, label: labelFor(r.mid) }
}

function band(value: number): BandView {
  const label = B.condition.bands.find((b) => value < b.max)!.label
  return { label, value: Math.round(value / 10) * 10 }
}

const TRAIT_NAMES: Record<string, string> = {
  power: 'Power', speed: 'Speed', stamina: 'Stamina', chin: 'Chin', defence: 'Defence',
  ringIQ: 'Ring IQ', adaptability: 'Adaptability', technique: 'Technique', counterPunching: 'Counter-punching',
  pressure: 'Pressure fighting', discipline: 'Discipline', heart: 'Heart', aggression: 'Aggression', composure: 'Composure',
  marketability: 'Marketability',
}

const RATING_WEIGHTS: [TraitKey, number][] = [
  ['power', 0.15], ['speed', 0.12], ['defence', 0.14], ['stamina', 0.11], ['chin', 0.13],
  ['ringIQ', 0.13], ['heart', 0.09], ['aggression', 0.05], ['adaptability', 0.08],
]

const HINTS: Record<Personality, string> = {
  Professional: 'Business-like', Loyal: 'Business-like', Greedy: 'Business-like',
  Showman: 'Outspoken', Arrogant: 'Outspoken', Volatile: 'Outspoken', Ambitious: 'Outspoken',
  Quiet: 'Reserved', Humble: 'Reserved', Fragile: 'Reserved',
}

function valueTier(mv: number): FighterView['market']['valueTier'] {
  return mv >= 75 ? 'Elite' : mv >= 58 ? 'Premium' : mv >= 40 ? 'Established' : mv >= 22 ? 'Mid-market' : 'Budget'
}

function historyText(state: GameState, h: Fighter['history'][number]): string {
  const promo = h.promotionId ? state.promotions[h.promotionId]?.name ?? 'a promotion' : null
  switch (h.kind) {
    case 'turnedPro': return 'Turned professional'
    case 'signed': return `Signed with ${promo}`
    case 'renewed': return `Re-signed with ${promo}`
    case 'released': return `Released by ${promo}`
    case 'expired': return `Contract with ${promo} expired`
    case 'retired': return 'Retired from boxing'
  }
}

// ----------------------------------------------------------- Fight-related views

const standingCache = new WeakMap<GameState, Map<string, Id[]>>()

function divisionOrder(state: GameState, wc: WeightClassId): Id[] {
  let m = standingCache.get(state)
  if (!m) { m = new Map(); standingCache.set(state, m) }
  let list = m.get(wc)
  if (!list) {
    list = Object.values(state.fighters)
      .filter((f) => f.status === 'active' && f.weightClass === wc && f.record.wins + f.record.losses + f.record.draws > 0)
      .map((f) => ({ id: f.id, s: publicStanding(publicFacts(f, state.today), f.momentum) }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.id)
    m.set(wc, list)
  }
  return list
}

function buildHistory(state: GameState, f: Fighter): FightHistoryItem[] {
  const out: FightHistoryItem[] = []
  for (const id of f.recentFights.slice().reverse()) {
    const ft = state.fights[id]
    if (!ft?.result) continue
    const isA = ft.sideA.fighterId === f.id
    const oppId = isA ? ft.sideB.fighterId : ft.sideA.fighterId
    const opp = state.fighters[oppId]
    const w = ft.result.winner
    out.push({
      fightId: id, day: ft.day, opponentId: oppId, opponentName: opp ? fighterName(opp) : 'Unknown',
      result: w === null ? 'D' : (w === 0) === isA ? 'W' : 'L', method: METHOD_SHORT[ft.result.method], round: ft.result.round, rounds: ft.scheduledRounds,
    })
  }
  return out
}

function scoutNotes(traits: FighterView['traits'], scouted: boolean, f: Fighter): string[] {
  const t = Object.fromEntries([...traits.physical, ...traits.technical, ...traits.mental].map((x) => [x.key, x])) as Record<string, TraitView>
  const pre = scouted ? '' : 'Reportedly '
  const phr: [number, string][] = []
  const add = (key: string, hi: [number, string][], lo: [number, string][]) => {
    const tv = t[key]
    if (!tv || (!scouted && !['power', 'chin'].includes(key))) return
    for (const [th, txt] of hi) if (tv.mid >= th) { phr.push([tv.mid - 50, pre + txt]); return }
    for (const [th, txt] of lo) if (tv.mid <= th) { phr.push([50 - tv.mid, pre + txt]); return }
  }
  add('power', [[72, 'heavy-handed'], [62, 'solid power']], [[40, 'light puncher']])
  add('chin', [[72, 'excellent durability'], [62, 'good durability']], [[42, 'questionable chin']])
  add('speed', [[72, 'lightning hands'], [62, 'quick hands']], [[40, 'slow hands']])
  add('stamina', [[72, 'great engine'], [62, 'good stamina']], [[42, 'tends to fade late']])
  add('defence', [[70, 'hard to hit'], [60, 'solid defence']], [[42, 'leaky defence']])
  add('ringIQ', [[72, 'smart ring general'], [62, 'ring-smart']], [[42, 'tactically raw']])
  add('heart', [[72, 'huge heart']], [[40, 'questionable in the trenches']])
  phr.sort((a, b) => b[0] - a[0])
  const notes = phr.slice(0, 4).map(([, x]) => x.charAt(0).toUpperCase() + x.slice(1))
  const fights = f.record.wins + f.record.losses + f.record.draws
  const koRate = f.record.wins ? Math.round((f.record.koWins / f.record.wins) * 100) : 0
  if (koRate >= 60 && f.record.wins >= 6) notes.push(`Known for stoppages (${koRate}% KO rate)`)
  if (f.record.koLosses >= 3) notes.push('Has been stopped several times')
  if (f.record.losses === 0 && fights >= 8) notes.push(`Unbeaten in ${fights}`)
  return notes.slice(0, 5)
}

// ------------------------------------------------------------------- Builder

function buildView(state: GameState, f: Fighter): FighterView {
  const facts = publicFacts(f, state.today)
  const entry = state.knowledge[f.id]
  const belief = (t: TraitKey) => beliefOf(state, f, t)
  const trait = (key: TraitKey): TraitView => ({ key, name: TRAIT_NAMES[key], scouted: !!entry?.est[key], ...range(belief(key)) })
  const derived = (key: string, parts: { e: Estimate; w: number }[], scouted: boolean): TraitView => ({ key, name: TRAIT_NAMES[key], scouted, ...range(blend(parts)) })
  const inv = (e: Estimate): Estimate => ({ mean: 100 - e.mean, sd: e.sd })

  const power = trait('power'), speed = trait('speed'), stamina = trait('stamina'), chin = trait('chin'), defence = trait('defence')
  const ringIQ = trait('ringIQ'), adaptability = trait('adaptability'), heart = trait('heart')
  const aggression = trait('aggression'), discipline = trait('discipline'), composure = trait('composure')
  const technicalScouted = !!entry?.est.ringIQ
  const technique = derived('technique', [{ e: belief('ringIQ'), w: 0.4 }, { e: belief('defence'), w: 0.3 }, { e: belief('adaptability'), w: 0.3 }], technicalScouted)
  const counter = derived('counterPunching', [{ e: belief('ringIQ'), w: 0.35 }, { e: belief('defence'), w: 0.35 }, { e: belief('speed'), w: 0.15 }, { e: inv(belief('aggression')), w: 0.15 }], technicalScouted)
  const pressure = derived('pressure', [{ e: belief('aggression'), w: 0.4 }, { e: belief('stamina'), w: 0.35 }, { e: belief('heart'), w: 0.25 }], technicalScouted)

  const grade = range(blend(RATING_WEIGHTS.map(([t, w]) => ({ e: belief(t), w }))))
  const know = knowledgeLevel(state, f)
  const reveal = personalityReveal(entry?.insight ?? 0)
  const fights = f.record.wins + f.record.losses + f.record.draws
  const c = f.contractId ? state.contracts[f.contractId] : null
  const mine = c?.promotionId === state.playerPromotionId
  const av = availabilityFor(state, f)
  const neg = state.negotiations[f.id]
  const mv = valueOf(state, f)

  let contract: FighterView['contract'] = { kind: 'none' }
  if (c && mine) {
    const weeksLeft = weeksBetween(state.today, c.endDay)
    contract = {
      kind: 'own', stage: contractStage(state, c), weeksLeft,
      contract: {
        id: c.id, startDay: c.startDay, endDay: c.endDay, weeklyRetainer: c.weeklyRetainer, basePurse: c.basePurse, winBonus: c.winBonus,
        titleBonus: c.titleBonus, ppvShare: c.ppvShare, signingBonus: c.signingBonus, fightsTotal: c.fightsTotal,
        fightsRemaining: c.fightsRemaining, minFightsPerYear: c.minFightsPerYear, titlePromise: c.titlePromise,
      },
    }
  } else if (c) {
    const weeks = weeksBetween(state.today, c.endDay)
    contract = { kind: 'rival', promotionId: c.promotionId, promotionName: state.promotions[c.promotionId]?.name ?? '?', approxMonthsLeft: Math.max(1, Math.round(weeks / 4.35 / 3) * 3) }
  }

  return {
    id: f.id, name: fighterName(f), firstName: f.firstName, lastName: f.lastName, nickname: f.nickname,
    nationKey: f.nationality, nationName: nation(f.nationality).name, hometown: f.hometown,
    age: fighterAge(f, state.today), birthDay: f.birthDay, weightClass: f.weightClass, division: weightClassLabel(f.weightClass),
    heightCm: f.heightCm, reachCm: f.reachCm, stance: f.stance, style: f.style, status: f.status,
    record: { ...f.record }, recordText: `${f.record.wins}-${f.record.losses}-${f.record.draws}`, fights,
    koRate: f.record.wins ? Math.round((f.record.koWins / f.record.wins) * 100) : 0,
    lastFightWeeksAgo: f.lastFightDay === null ? null : weeksBetween(f.lastFightDay, state.today),
    stage: publicStage(facts), popularity: Math.round(f.popularity), reputation: Math.round(f.reputation),
    discovered: !!entry, shortlisted: state.shortlist.includes(f.id), bio: f.bio,
    grade, ceiling: range(belief('potential')), marketability: range(belief('marketability')),
    traits: {
      physical: [power, speed, stamina, chin, defence],
      technical: [ringIQ, adaptability, technique, counter, pressure],
      mental: [discipline, heart, aggression, composure],
    },
    knowledge: {
      level: know.level, confidence: know.confidence, reports: entry?.reports.length ?? 0,
      reportLog: (entry?.reports ?? []).map((r) => ({ ...r, weeksAgo: weeksBetween(r.day, state.today) })).reverse(),
      lastReportWeeksAgo: entry?.reports.length ? weeksBetween(entry.reports[entry.reports.length - 1].day, state.today) : null,
    },
    personality: {
      reveal, hint: reveal !== 'unknown' ? HINTS[f.personality] : null,
      trait: reveal === 'revealed' ? f.personality : null, note: reveal === 'revealed' ? f.personalityNote : null,
    },
    contract,
    market: {
      tags: marketTags(state, f), askBand: publicAskBand(state, f), valueTier: valueTier(mv),
      signable: av.signable, unavailableReason: av.reason ?? null,
      negotiation: neg ? {
        status: neg.status, kind: neg.kind, rounds: neg.rounds.length, hasCounter: !!neg.lastCounter,
        lockedWeeks: neg.lockedUntil !== null && neg.lockedUntil > state.today ? weeksBetween(state.today, neg.lockedUntil) : null,
      } : null,
      availableWeeks: f.availableSince === null ? null : weeksBetween(f.availableSince, state.today),
      rivalOffer: rivalOfferFor(state, f.id),
    },
    history: f.history.map((h) => ({ day: h.day, kind: h.kind, text: historyText(state, h), promotionId: h.promotionId })).sort((a, b) => b.day - a.day),
    availability: availabilityView(state, f),
    form: f.recentFights.slice(-5).map((id) => state.fights[id]).filter((x) => x?.result).map((x) => {
      const isA = x.sideA.fighterId === f.id
      const w = x.result!.winner
      return w === null ? 'D' : (w === 0) === isA ? 'W' : 'L'
    }) as ('W' | 'L' | 'D')[],
    fightHistory: buildHistory(state, f),
    momentumLabel: f.momentum > 45 ? 'Surging' : f.momentum > 15 ? 'Rising' : f.momentum > -15 ? 'Steady' : f.momentum > -45 ? 'Slipping' : 'Struggling',
    standing: (() => { const o = divisionOrder(state, f.weightClass); const i = o.indexOf(f.id); return { rank: i < 0 ? 0 : i + 1, of: o.length } })(),
    mediaRank: headlineRank(state, f),
    notes: scoutNotes({ physical: [power, speed, stamina, chin, defence], technical: [ringIQ, adaptability, technique, counter, pressure], mental: [discipline, heart, aggression, composure] }, !!(entry?.reports.length) || mine, f),
    activeFightId: f.activeFightId,
    own: mine ? {
      workingOn: FOCUS_WORK[f.trainingFocus], workingWhy: trainerFocus(state, f).why, fitness: band(f.fitness), conditioning: band(f.conditioning), confidence: band(f.confidence), morale: band(f.morale),
      mood: f.morale >= 80 ? 'Fired up' : f.morale >= 62 ? 'Content' : f.morale >= 45 ? 'Restless' : f.morale >= 30 ? 'Unhappy' : 'Miserable',
    } : null,
  }
}

function availabilityView(state: GameState, f: Fighter): AvailabilityView {
  if (f.status === 'retired') return { status: 'retired', label: 'Retired', weeks: null }
  if (f.injury) return { status: 'injured', label: `Injured${f.contractId && state.contracts[f.contractId]?.promotionId === state.playerPromotionId ? ` (${f.injury.kind})` : ''}`, weeks: Math.max(1, weeksBetween(state.today, f.injury.returnDay)) }
  if (f.suspendedUntil !== null && f.suspendedUntil > state.today) return { status: 'suspended', label: 'Medical suspension', weeks: Math.max(1, weeksBetween(state.today, f.suspendedUntil)) }
  if (f.activeFightId) return { status: 'booked', label: 'Booked for a fight', weeks: null }
  const av = fightAvailability(state, f)
  if (!av.ok) return { status: 'resting', label: 'Resting', weeks: null }
  const rest = f.lastFightDay === null ? 0 : f.lastFightDay + B.fights.restWeeks * 7
  if (rest > state.today) return { status: 'resting', label: 'Resting after last fight', weeks: Math.max(1, weeksBetween(state.today, rest)) }
  return { status: 'available', label: 'Available', weeks: null }
}

const cache = new WeakMap<GameState, Views>()

/** Views are memoised per GameState object (the store replaces state immutably). */
export function viewsOf(state: GameState): Views {
  const hit = cache.get(state)
  if (hit) return hit
  const perFighter = new Map<Id, FighterView>()
  const get = (id: Id): FighterView | null => {
    const f = state.fighters[id]
    if (!f) return null
    let v = perFighter.get(id)
    if (!v) { v = buildView(state, f); perFighter.set(id, v) }
    return v
  }
  const fromIds = (ids: Id[]) => ids.map(get).filter((v): v is FighterView => !!v)
  const known = Object.keys(state.knowledge)
  const views: Views = {
    fighter: get,
    rosterOf: (pid) => fromIds(Object.values(state.contracts).filter((c) => c.promotionId === pid).map((c) => c.fighterId)),
    known: () => fromIds(known),
    mine: () => fromIds(Object.values(state.contracts).filter((c) => c.promotionId === state.playerPromotionId).map((c) => c.fighterId)),
    freeAgents: () => fromIds(known.filter((id) => { const f = state.fighters[id]; return f && f.status === 'active' && f.contractId === null })),
    contractedElsewhere: () => fromIds(known.filter((id) => {
      const f = state.fighters[id]
      const c = f?.contractId ? state.contracts[f.contractId] : null
      return !!c && c.promotionId !== state.playerPromotionId && f.status === 'active'
    })),
  }
  cache.set(state, views)
  return views
}
