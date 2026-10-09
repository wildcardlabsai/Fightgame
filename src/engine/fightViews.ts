/**
 * Player-facing fight views. Only public results and the player's beliefs about fighters appear here.
 */
import { trainerReport, type TrainerReport } from './office/trainer'
import { weeksBetween } from './calendar'
import { BALANCE as B } from './balance'
import { fighterName } from './fighters'
import { STATUS_LABEL } from './fight/lifecycle'
import { METHOD_LABEL, isStoppage, performanceNote, punishmentLabel, resultHeadline, resultSummary, roundLine } from './fight/narrative'
import { fightInvolvesPlayer, scheduleOptions, type DateOption } from './fights'
import { assess, type Assessment } from './matchmaking'
import { viewsOf, type FighterView } from './view'
import type { FightMethod, FightOffer, FightPrep, GameState, Id, Mood } from './types'

export interface FightListItem {
  id: Id
  day: number
  status: string
  statusKey: string
  aName: string; bName: string; aId: Id; bId: Id
  aRecord: string; bRecord: string
  division: string
  rounds: number
  city: string
  mine: boolean
  resultText?: string
  method?: string
  winner?: 0 | 1 | null
  importance?: number
  weeksAway?: number
}

export interface RoundView {
  n: number
  line: string
  a: { thrown: number; landed: number; power: number }
  b: { thrown: number; landed: number; power: number }
  kd: [number, number]
  /** Per-judge round scores as "10-9". */
  cards: string[]
  winner: 0 | 1 | 2
  punish: [string, string]
  /** Recorded energy 0–100: [start, end] of the round per fighter. null on fights saved before recording existed. */
  stamina: { a: [number, number]; b: [number, number] } | null
  /** Recorded control 0–100 for side A (50 = even) at [start, end] of the round, from the sim's momentum. null on older saves. */
  control: [number, number] | null
  /** Recorded knockdowns this round with the referee's count. Empty if none (or not recorded). */
  counts: KnockdownView[]
}

export interface KnockdownView {
  /** Fighter knocked down: 0 = A, 1 = B. */
  down: 0 | 1
  segment: number
  /** Count reached (10 = counted out). */
  count: number
  /** True if the fighter got up. */
  rose: boolean
}

/** Title metadata for presentation. Only ever populated from a fight that explicitly carries a title. */
export interface TitleView { isTitleFight: true; titleName: string; titleTier: 'regional' | 'national' | 'international' | 'world'; label: string }
export const TITLE_TIER_LABEL: Record<TitleView['titleTier'], string> = { regional: 'REGIONAL TITLE', national: 'NATIONAL TITLE', international: 'INTERNATIONAL TITLE', world: 'WORLD TITLE' }
export function titleView(t: { name: string; tier: TitleView['titleTier'] } | undefined | null): TitleView | null {
  return t ? { isTitleFight: true, titleName: t.name, titleTier: t.tier, label: TITLE_TIER_LABEL[t.tier] } : null
}

export interface ResultView {
  headline: string
  summary: string
  winner: 0 | 1 | null
  method: FightMethod
  methodLabel: string
  round: number
  seconds: number
  stoppage: boolean
  cards: { a: number; b: number }[]
  kd: [number, number]
  stats: { thrown: [number, number]; landed: [number, number]; power: [number, number]; powerThrown: [number, number]; acc: [number, number]; powerAcc: [number, number] }
  deductions: [number, number]
  rounds: RoundView[] | null
  assessment: [string, string]
  upsetLabel: 'Major upset' | 'Upset' | null
  after: [string, string]
  dRep: [number, number]
  dPop: [number, number]
  /** Why this result mattered more or less to each of your fighters than the bare expectation (empty for fights that are not yours). */
  context?: [string[], string[]]
  injuries: [{ kind: string; severity: string; weeks: number } | null, { kind: string; severity: string; weeks: number } | null]
  money: { label: string; amount: number }[]
}

export interface FightSideView {
  fighter: FighterView
  promotionName: string | null
  preRecord: string
  mine: boolean
  prep: FightPrep | null
  /** The trainer's report on this fighter (own fighters only): what the camp is doing and how ready he is. */
  trainer: TrainerReport | null
}

export interface FightNegotiationView {
  rounds: { day: number; offer: FightOffer; verdict: string; counter: FightOffer | null; reasons: string[]; mood: Mood }[]
  counter: FightOffer | null
  patience: 'Patient' | 'Cooling' | 'Running out of patience'
  status: 'open' | 'broken'
  suggested: FightOffer
}

export interface FightView {
  id: Id
  status: string
  statusKey: string
  day: number
  weeksAway: number
  city: string
  country: string
  division: string
  rounds: number
  kind: 'player' | 'ai'
  mine: boolean
  organiserName: string
  a: FightSideView
  b: FightSideView
  /** Only when you are the organiser. */
  terms: { purseA: number; purseB: number; winBonusA: number; winBonusB: number; rematch: boolean; venuePref: string; fights: number } | null
  negotiation: FightNegotiationView | null
  scheduleOptions: DateOption[]
  stakes: string[]
  matchup: Assessment | null
  previousMeetings: number
  canRunNight: boolean
  /** Set when the fight is part of a show: the night is run from the event. */
  eventId: Id | null
  eventName: string | null
  cancelReason: string | null
  result: ResultView | null
  headline: string
  seriesNote: string | null
  title: TitleView | null
}

const label = (n: number) => `${n}`

export function fightListItem(state: GameState, id: Id): FightListItem | null {
  const f = state.fights[id]
  if (!f) return null
  const A = state.fighters[f.sideA.fighterId], Bf = state.fighters[f.sideB.fighterId]
  if (!A || !Bf) return null
  const nA = fighterName(A), nB = fighterName(Bf)
  const r = f.result
  return {
    id, day: f.day, status: STATUS_LABEL[f.status], statusKey: f.status, aName: nA, bName: nB, aId: A.id, bId: Bf.id,
    aRecord: f.sideA.preRecord, bRecord: f.sideB.preRecord, division: viewsOf(state).fighter(A.id)!.division, rounds: f.scheduledRounds, city: f.city,
    mine: fightInvolvesPlayer(state, f), resultText: r ? resultHeadline(f, nA, nB) : undefined, method: r ? METHOD_LABEL[r.method] : undefined,
    winner: r ? r.winner : undefined, importance: r?.importance, weeksAway: f.day ? Math.max(0, weeksBetween(state.today, f.day)) : undefined,
  }
}

export function fightList(state: GameState, mode: 'mine-open' | 'mine-results' | 'world-results', limit = 60): FightListItem[] {
  const all = Object.values(state.fights)
  const sel = all.filter((f) => {
    const mine = fightInvolvesPlayer(state, f)
    if (mode === 'mine-open') return mine && ['negotiating', 'agreed', 'scheduled', 'training', 'fightNight'].includes(f.status)
    if (mode === 'mine-results') return mine && f.status === 'postFight'
    return !mine && f.status === 'postFight'
  })
  sel.sort((x, y) => (mode === 'mine-open' ? (x.day || 9e9) - (y.day || 9e9) : y.day - x.day))
  return sel.slice(0, limit).map((f) => fightListItem(state, f.id)).filter((x): x is FightListItem => !!x)
}

function afterRecord(pre: string, side: 0 | 1, r: NonNullable<ReturnType<typeof rawResult>>): string {
  const [w, l, d] = pre.split('-').map(Number)
  const won = r.winner === side, lost = r.winner === 1 - side
  return `${w + (won ? 1 : 0)}-${l + (lost ? 1 : 0)}-${d + (r.winner === null ? 1 : 0)}`
}
const rawResult = (state: GameState, id: Id) => state.fights[id]?.result

export function fightView(state: GameState, id: Id): FightView | null {
  const fight = state.fights[id]
  if (!fight) return null
  const views = viewsOf(state)
  const va = views.fighter(fight.sideA.fighterId), vb = views.fighter(fight.sideB.fighterId)
  if (!va || !vb) return null
  const nA = va.name, nB = vb.name
  const mine = fightInvolvesPlayer(state, fight)
  const isPlayerOrg = fight.organiserId === state.playerPromotionId
  const aMine = fight.sideA.promotionId === state.playerPromotionId
  const bMine = fight.sideB.promotionId === state.playerPromotionId
  const mkSide = (side: typeof fight.sideA, v: FighterView, own: boolean): FightSideView => ({
    fighter: v, promotionName: side.promotionId ? state.promotions[side.promotionId]?.name ?? null : null, preRecord: side.preRecord, mine: own, prep: own ? { ...side.prep } : null,
    trainer: own ? trainerReport(state, fight, side === fight.sideA ? 0 : 1) : null,
  })
  const my = aMine ? va : bMine ? vb : null
  const opp = aMine ? vb : bMine ? va : null
  const matchup = my && opp && ['negotiating', 'agreed', 'scheduled', 'training', 'fightNight'].includes(fight.status) ? assess(my, opp) : null
  const neg = fight.negotiation
  const r = fight.result
  const res: ResultView | null = r ? buildResult(fight, nA, nB, mine, isPlayerOrg) : null
  const prev = [...va.fightHistory].filter((h) => h.opponentId === vb.id && h.fightId !== fight.id).length
  const stakes: string[] = []
  if (['scheduled', 'training', 'fightNight', 'agreed', 'negotiating'].includes(fight.status)) {
    stakes.push(`${va.recordText} vs ${vb.recordText}`)
    if (Math.abs(va.reputation - vb.reputation) > 15) stakes.push(`${va.reputation > vb.reputation ? nA : nB} is the bigger name`)
    if (va.record.losses === 0 && va.fights >= 8) stakes.push(`${nA}'s unbeaten record is on the line`)
    if (vb.record.losses === 0 && vb.fights >= 8) stakes.push(`${nB}'s unbeaten record is on the line`)
    if (prev > 0) stakes.push('A rematch')
  }
  return {
    id, status: STATUS_LABEL[fight.status], statusKey: fight.status, day: fight.day, weeksAway: fight.day ? Math.max(0, weeksBetween(state.today, fight.day)) : 0,
    city: fight.city, country: fight.country, division: va.division, rounds: fight.scheduledRounds, kind: fight.kind, mine,
    organiserName: state.promotions[fight.organiserId]?.name ?? '—',
    a: mkSide(fight.sideA, va, aMine), b: mkSide(fight.sideB, vb, bMine),
    terms: isPlayerOrg ? { purseA: fight.terms.purseA, purseB: fight.terms.purseB, winBonusA: fight.terms.winBonusA, winBonusB: fight.terms.winBonusB, rematch: fight.terms.rematch, venuePref: fight.terms.venuePref, fights: fight.terms.fights } : null,
    negotiation: neg ? {
      rounds: neg.rounds.map((x) => ({ ...x })), counter: neg.status === 'open' ? neg.lastCounter : null,
      patience: neg.patience >= 3 ? 'Patient' : neg.patience >= 2 ? 'Cooling' : 'Running out of patience', status: neg.status, suggested: suggested(state, fight.sideB.fighterId),
    } : null,
    scheduleOptions: fight.status === 'agreed' ? scheduleOptions(state, id) : [],
    stakes, matchup, previousMeetings: prev, canRunNight: fight.status === 'fightNight' && mine, eventId: fight.eventId ?? null, eventName: fight.eventId ? state.events[fight.eventId]?.name ?? null : null, cancelReason: fight.cancelReason ?? null, result: res,
    headline: r ? resultHeadline(fight, nA, nB) : `${nA} vs ${nB}`,
    title: titleView(fight.title),
    seriesNote: fight.seriesOf ? 'Second fight of a two-fight deal' : Object.values(state.fights).some((x) => x.seriesOf === id) ? 'First fight of a two-fight deal' : null,
  }
}

import { suggestedFightOffer } from './fightNegotiation'
const suggested = (state: GameState, oppId: Id) => suggestedFightOffer(state, oppId)

function buildResult(fight: NonNullable<GameState['fights'][string]>, nA: string, nB: string, mine: boolean, isPlayerOrg: boolean): ResultView {
  const r = fight.result!
  const sA = nA.split(' ').slice(-1)[0], sB = nB.split(' ').slice(-1)[0]
  const t = r.tot
  const rounds: RoundView[] | null = r.rounds
    ? r.rounds.map((rd, i) => {
      const cards = [0, 1, 2].map((j) => `${rd.s[j * 2]}-${rd.s[j * 2 + 1]}`)
      return {
        n: i + 1, line: roundLine(rd, i, sA, sB), a: { thrown: rd.t[0], landed: rd.t[1], power: rd.t[3] }, b: { thrown: rd.t[4], landed: rd.t[5], power: rd.t[7] },
        kd: [rd.k[0], rd.k[1]] as [number, number], cards, winner: rd.b[0] as 0 | 1 | 2, punish: [punishmentLabel(rd.p[0]), punishmentLabel(rd.p[1])] as [string, string],
        stamina: rd.e ? { a: [rd.e[0], rd.e[1]], b: [rd.e[2], rd.e[3]] } : null,
        control: rd.m ? [Math.round((rd.m[0] + 100) / 2), Math.round((rd.m[1] + 100) / 2)] : null,
        counts: (rd.c ?? []).map((c) => ({ down: c.s, segment: c.g, count: c.n, rose: c.u === 1 })),
      }
    })
    : null
  const wA = r.winner === null ? null : r.winner === 0
  const money: { label: string; amount: number }[] = []
  if (isPlayerOrg) {
    money.push({ label: `Purse — ${nA}`, amount: fight.terms.purseA }, { label: `Purse — ${nB}`, amount: fight.terms.purseB })
    if (r.winner === 0 && fight.terms.winBonusA) money.push({ label: `Win bonus — ${nA}`, amount: fight.terms.winBonusA })
    if (r.winner === 1 && fight.terms.winBonusB) money.push({ label: `Win bonus — ${nB}`, amount: fight.terms.winBonusB })
  }
  const inj = (i: Injury | null) => (i && mine ? { kind: i.kind, severity: i.severity, weeks: Math.round((i.returnDay - i.startDay) / 7) } : null)
  return {
    headline: resultHeadline(fight, nA, nB), summary: resultSummary(fight, nA, nB), winner: r.winner, method: r.method, methodLabel: METHOD_LABEL[r.method],
    round: r.round, seconds: r.second, stoppage: isStoppage(r.method), cards: r.cards.map((c) => ({ a: c[0], b: c[1] })), kd: r.kd,
    stats: {
      thrown: [t[0], t[4]], landed: [t[1], t[5]], power: [t[3], t[7]], powerThrown: [t[2], t[6]],
      acc: [t[0] ? Math.round((t[1] / t[0]) * 100) : 0, t[4] ? Math.round((t[5] / t[4]) * 100) : 0],
      powerAcc: [t[2] ? Math.round((t[3] / t[2]) * 100) : 0, t[6] ? Math.round((t[7] / t[6]) * 100) : 0],
    },
    deductions: r.deductions, rounds,
    assessment: [performanceNote(sA, t[1], t[0], t[5], t[3], r.kd[0], wA === null ? null : wA), performanceNote(sB, t[5], t[4], t[1], t[7], r.kd[1], wA === null ? null : !wA)],
    upsetLabel: r.upset > 0.62 ? 'Major upset' : r.upset > 0.45 ? 'Upset' : null,
    after: [afterRecord(fight.sideA.preRecord, 0, r), afterRecord(fight.sideB.preRecord, 1, r)],
    dRep: r.dRep, dPop: r.dPop, context: r.notes ?? [[], []], injuries: [inj(r.injuries[0]), inj(r.injuries[1])], money,
  }
}
import type { Injury } from './types'
void label; void B
