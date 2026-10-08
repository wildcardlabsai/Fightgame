/**
 * THE MARKET VALUE ENGINE.
 *
 * A fighter's economic worth is NOT one number and NOT popularity. This module keeps five distinct ideas apart:
 *
 *   careerValue      0–100  what the whole career is worth on the open market (record, who they beat, ranking, belts, form,
 *                           activity, age, and — as ONE input among many — fame). Drives contracts and the going rate.
 *   commercialValue  0–100  what the NAME is worth to sponsors and broadcasters (popularity, interest, reach). Media layer.
 *   fightValue       £      what THIS fight is worth to THIS fighter: market rate shaped by opponent, title, platform, venue.
 *   contractValue    £      the multi-fight package: retainer + purses over the term (see terms.ts).
 *   titleFightValue  £      the same bout with a belt (or an eliminator) at stake.
 *
 * Everything here reads PUBLIC facts only: the record, ranking, titles, popularity and media numbers a player could look up.
 * It never reads attributes, potential, personality or any private quantity (the old "industry buzz" that peeked at potential is gone).
 *
 * Economic guardrails (`purseBounds`) keep an individual purse inside what the event can actually support, in both directions:
 * a club-show prospect cannot demand a gate-sized purse, and a world superstar cannot be priced as a journeyman on a major PPV.
 */
import { BALANCE as B } from '../balance'
import { weeksBetween } from '../calendar'
import { clamp, fighterAge } from '../fighters'
import { mediaOf, commercialValue as mediaCommercial } from '../media/popularity'
import { PRIMARY_RANKING } from '../media/orgs'
import { rankIn } from '../media/rankings'
import { titlesHeldBy } from '../media/titles'
import { forecastEvent } from '../events/demand'
import type { BoxingEvent, Fighter, Fight, GameState } from '../types'
import { LEVEL_STAKES, levelOf, levelRank, type TitleLevel } from './titleDefs'

const round = (n: number, step: number) => Math.round(n / step) * step

export interface ValueBreakdown {
  reputation: number
  fame: number
  record: number
  opposition: number
  ranking: number
  titles: number
  form: number
  activity: number
  stoppages: number
  unbeaten: number
  age: number
  ageMult: number
  raw: number
  value: number
}

function ageMult(age: number): number {
  let m = 1
  for (const d of B.market.ageDiscount) if (age >= d.age) m = d.mult
  return m
}

/** Recent bouts as seen from the fighter: result and the opponent's reputation. Public (results and names are public). */
function recentBouts(state: GameState, f: Fighter, n = 6): { win: boolean | null; oppRep: number }[] {
  const out: { win: boolean | null; oppRep: number }[] = []
  for (let i = f.recentFights.length - 1; i >= 0 && out.length < n; i--) {
    const ft = state.fights[f.recentFights[i]]
    if (!ft?.result) continue
    const isA = ft.sideA.fighterId === f.id
    const oppId = isA ? ft.sideB.fighterId : ft.sideA.fighterId
    const opp = state.fighters[oppId]
    if (!opp) continue
    const w = ft.result.winner
    out.push({ win: w === null ? null : (w === 0) === isA, oppRep: opp.reputation })
  }
  return out
}

/**
 * Best belt currently held, as a 0–100 standing; plus a smaller memory of belts held before.
 * When the media world is not feeding the economy (`media.effects` off) or a fighter has no belt, reputation — the engine's own
 * measure of sporting standing — supplies a proxy, so the same fighter is valued the same way with or without the press.
 */
function titleStanding(state: GameState, f: Fighter): number {
  const media = state.media
  let best = 0
  if (media?.effects) for (const t of titlesHeldBy(media, f.id)) best = Math.max(best, LEVEL_STAKES[levelOf(t.body)].value)
  // Several world belts at once (unified), or all of them (undisputed), is worth more than any single belt.
  if (media?.effects && best > 0) { const wb = titlesHeldBy(media, f.id).filter((t) => t.wc === f.weightClass && levelOf(t.body) === 'world').length; if (wb >= 2) best = Math.min(100, best + 4 + 3 * (wb - 2)) }
  const past = media?.effects ? state.business?.titleHist[f.id] : undefined
  if (past?.best && best === 0) best = LEVEL_STAKES[past.best].value * 0.35
  return Math.max(best, clamp((f.reputation - 60) * 2, 0, 50))
}

function rankStanding(state: GameState, f: Fighter): number {
  const media = state.media
  let actual = 0
  if (media?.effects) {
    const r = rankIn(media, PRIMARY_RANKING, f.weightClass, f.id)
    if (r !== null) actual = r === 0 ? 100 : clamp(100 - (r - 1) * 5.5, 40, 98)
  }
  return Math.max(actual, clamp((f.reputation - 45) * 2.2, 0, 70))
}

export function valueBreakdown(state: GameState, f: Fighter): ValueBreakdown {
  const age = fighterAge(f, state.today)
  const fights = f.record.wins + f.record.losses + f.record.draws
  const bouts = recentBouts(state, f)
  const m = state.media?.effects ? mediaOf(state.media, f) : null

  // Record: win rate shrunk toward 50% for small samples, rewarded for volume of work.
  const winPct = (f.record.wins + 2) / (fights + 4)
  const record = clamp(100 * Math.pow(winPct, 1.5) * Math.min(1, 0.55 + fights / 24), 0, 100)
  // Opposition: who they have been in with. Wins over the better names count most; losses to good opposition are forgiven.
  let opposition = f.reputation
  if (bouts.length) {
    let s = 0, w = 0
    for (const b of bouts) { const k = b.win === true ? 1.2 : b.win === null ? 0.8 : 0.55; s += b.oppRep * k; w += k }
    opposition = clamp((s / w) * 1.05, 0, 100)
  }
  const form = clamp(50 + f.momentum * 0.5, 0, 100)
  const activity = f.lastFightDay === null ? 50 : clamp(100 - Math.max(0, weeksBetween(f.lastFightDay, state.today) - 10) * 1.6, 0, 100)
  const stoppages = fights >= 5 ? clamp((100 * f.record.koWins) / Math.max(1, f.record.wins) * 1.1, 0, 100) : 0
  const unbeaten = f.record.losses === 0 && fights >= 8 ? clamp(fights * 6, 0, 100) : 0
  const fame = clamp(0.62 * f.popularity + 0.38 * (m?.interest ?? f.popularity * 0.6), 0, 100)
  const ranking = rankStanding(state, f)
  const titles = titleStanding(state, f)
  const am = ageMult(age)

  // Weights: reputation and the quality of the career dominate; fame is one input of eight, and cannot carry the total alone.
  const raw = 0.2 * f.reputation + 0.13 * fame + 0.13 * opposition + 0.1 * record + 0.11 * ranking + 0.11 * titles + 0.07 * form + 0.06 * activity + 0.05 * stoppages + 0.04 * unbeaten
  const value = (raw <= CAL.knee ? raw : CAL.knee + (raw - CAL.knee) * CAL.slope) * am
  return { reputation: f.reputation, fame, record, opposition, ranking, titles, form, activity, stoppages, unbeaten, age, ageMult: am, raw, value: clamp(value, 3, 99) }
}

/** Calibration of raw → market value (0–100), fitted so the world's distribution matches the pre-5.4 market (see FIGHT_BUSINESS.md). */
export const CAL = { knee: 50, slope: 0.85 }

/** Career market value, 0–100. Dynamic: it moves with results, ranking, belts, activity and age. */
export function careerValue(state: GameState, f: Fighter): number {
  return valueBreakdown(state, f).value
}

/** What the NAME is worth commercially (0–100). Separate from careerValue on purpose. */
export function commercialAppeal(state: GameState, f: Fighter): number {
  return state.media?.effects ? mediaCommercial(state, state.media, f) : clamp(f.popularity, 0, 100)
}

// ------------------------------------------------------------------ Purses

/** Going rate for a fighter of this career value: one bout, before context. */
export function marketPurse(mv: number): number {
  const m = B.market
  return round(Math.max(m.purse.min, m.purse.a * Math.exp(m.purse.b * (mv / 100))), 100)
}

export type FightKind = 'standard' | 'eliminator' | 'title' | 'unification'

export interface FightContext {
  kind: FightKind
  level: TitleLevel | null
  /** Opponent's career value (0–100), when known. */
  opponentValue: number | null
  /** 0 = opener … 3 = main event. */
  billing: 0 | 1 | 2 | 3
  broadcast: 'none' | 'localTv' | 'nationalTv' | 'streaming' | 'ppv'
  venuePrestige: number
  /** The fighter fights in their own country. */
  home: boolean
  /** Public forecast of the event's total revenue, when there is an event to judge. */
  eventRevenue: number | null
}

const PLATFORM: Record<FightContext['broadcast'], number> = { none: 1, localTv: 1.04, nationalTv: 1.1, streaming: 1.06, ppv: 1.22 }
const BILLING_SHARE = [0.04, 0.07, 0.14, 0.3]

/** What this bout is worth to this fighter, as a market estimate (a ±range is applied by the caller). */
export function fightValue(mv: number, ctx: FightContext): number {
  let p = marketPurse(mv)
  if (ctx.opponentValue !== null) p *= clamp(0.9 + 0.2 * (ctx.opponentValue / Math.max(5, mv)), 0.85, 1.25)
  if (ctx.level && ctx.kind !== 'standard') {
    const s = LEVEL_STAKES[ctx.level].purse
    const k = ctx.kind === 'eliminator' ? 1 + (s - 1) * 0.55 : ctx.kind === 'unification' ? s * 1.25 : s
    p *= k
  }
  p *= PLATFORM[ctx.broadcast]
  p *= 0.95 + 0.04 * ctx.venuePrestige
  p *= ctx.home ? 0.97 : 1.04
  return round(p, 100)
}

export interface PurseBounds {
  /** The bout's market value. */
  market: number
  /** What the event can support for this fighter, or null when there is no event to judge against. */
  affordable: number | null
  floor: number
  ceiling: number
  /** What the guardrail did to the market figure. */
  limited: 'none' | 'ceiling' | 'floor'
}

/**
 * Guardrails: keep a purse inside what the event economics can carry.
 *   ceiling: this fighter's slice of the forecast revenue at their billing (shared with the opponent by career value);
 *   floor:   a headliner is never priced as an undercard fighter on an event that earns serious money.
 * Without an event (a contract in the abstract) the market figure is returned unchanged.
 */
export function purseBounds(mvSelf: number, mvOpp: number, ctx: FightContext): PurseBounds {
  const market = fightValue(mvSelf, ctx)
  if (ctx.eventRevenue === null || ctx.eventRevenue <= 0) return { market, affordable: null, floor: market, ceiling: market, limited: 'none' }
  const share = BILLING_SHARE[ctx.billing] * (mvSelf / Math.max(1, mvSelf + mvOpp)) * 2
  const affordable = round(ctx.eventRevenue * share, 100)
  const ceiling = Math.max(round(affordable * 1.35, 100), 1_000)
  const floor = ctx.billing >= 2 ? round(affordable * 0.3, 100) : 0
  const limited = market > ceiling ? 'ceiling' : market < floor ? 'floor' : 'none'
  return { market, affordable, floor, ceiling, limited }
}

/** The purse the camp would settle around once guardrails apply. */
export function boundedPurse(mvSelf: number, mvOpp: number, ctx: FightContext): number {
  const b = purseBounds(mvSelf, mvOpp, ctx)
  return clamp(b.market, b.floor, Math.max(b.ceiling, b.floor))
}

export function contextFor(state: GameState, fight: Fight, side: 0 | 1, ev: BoxingEvent | undefined, eventRevenue: number | null): FightContext {
  const me = state.fighters[side === 0 ? fight.sideA.fighterId : fight.sideB.fighterId]
  const opp = state.fighters[side === 0 ? fight.sideB.fighterId : fight.sideA.fighterId]
  const venue = ev ? state.venues[ev.venueId] ?? null : fight.venueId ? state.venues[fight.venueId] ?? null : null
  const idx = ev ? ev.card.indexOf(fight.id) : -1
  const n = ev?.card.length ?? 0
  const billing: FightContext['billing'] = ev && idx >= 0 ? (idx === n - 1 ? 3 : idx === n - 2 && n >= 3 ? 2 : idx === 0 && n >= 4 ? 0 : 1) : 1
  const t = fight.title
  const level: TitleLevel | null = t ? t.level ?? 'world' : null
  const kind: FightKind = t ? t.kind ?? 'title' : 'standard'
  return {
    kind, level, opponentValue: opp ? careerValue(state, opp) : null, billing, broadcast: ev?.broadcast.kind ?? 'none',
    venuePrestige: venue?.prestige ?? 2, home: !!venue && !!me && venue.country === me.nationality, eventRevenue,
  }
}

export { levelRank }

/** Public forecast of an event's total revenue (mid-point), or null when there is nothing to forecast. */
export function eventRevenueMid(state: GameState, ev: BoxingEvent | undefined): number | null {
  if (!ev || ev.card.length === 0) return null
  try { const fc = forecastEvent(state, ev); return (fc.revenue.lo + fc.revenue.hi) / 2 } catch { return null }
}
