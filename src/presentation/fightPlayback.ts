/**
 * Live fight presentation — pure functions over the ALREADY-DECIDED result (ResultView/RoundView).
 *
 * Nothing in here simulates, randomises or writes anything: the engine decided the fight before the first bell, and
 * these helpers only decide what to SHOW and when. Every mode (watch / key moments / quick) therefore ends on exactly
 * the same stats, scores, winner and method, because they all read the same ResultView.
 */
import type { ResultView, RoundView } from '../engine/fightViews'

import type { PlayMode } from '../engine/preferences'
export type { PlayMode }
export const PLAY_MODES: { id: PlayMode; label: string; hint: string }[] = [
  { id: 'watch', label: 'Watch fight', hint: 'Every round, at broadcast pace.' },
  { id: 'key', label: 'Key moments', hint: 'Skim the quiet rounds; slow down for knockdowns and the finish.' },
  { id: 'quick', label: 'Quick sim', hint: 'Straight to the result.' },
]

export interface SideTotals { thrown: number; landed: number; power: number; knockdowns: number; accuracy: number }
const empty = (): SideTotals => ({ thrown: 0, landed: 0, power: 0, knockdowns: 0, accuracy: 0 })

/** Running totals after `upTo` rounds (0 = before the first bell). Summed from the recorded rounds only. */
export function totalsThrough(rounds: RoundView[], upTo: number): [SideTotals, SideTotals] {
  const a = empty(), b = empty()
  for (const rd of rounds.slice(0, Math.max(0, upTo))) {
    a.thrown += rd.a.thrown; a.landed += rd.a.landed; a.power += rd.a.power; a.knockdowns += rd.kd[0]
    b.thrown += rd.b.thrown; b.landed += rd.b.landed; b.power += rd.b.power; b.knockdowns += rd.kd[1]
  }
  a.accuracy = a.thrown ? Math.round((100 * a.landed) / a.thrown) : 0
  b.accuracy = b.thrown ? Math.round((100 * b.landed) / b.thrown) : 0
  return [a, b]
}

/** Share of punches landed in the latest revealed round, 0–100 for side A (50 = even). Display only: no new model. */
export function control(rounds: RoundView[], upTo: number): number {
  const rd = rounds[upTo - 1]
  if (!rd) return 50
  const tot = rd.a.landed + rd.b.landed
  return tot ? Math.round((100 * rd.a.landed) / tot) : 50
}

/** Rounds won on the judges' scoring so far: [A, B, even]. Uses the recorded per-round winner, not a new calculation. */
export function roundsWon(rounds: RoundView[], upTo: number): [number, number, number] {
  const w: [number, number, number] = [0, 0, 0]
  for (const rd of rounds.slice(0, Math.max(0, upTo))) w[rd.winner === 0 ? 0 : rd.winner === 1 ? 1 : 2]++
  return w
}

export const hasKnockdown = (rd: RoundView) => rd.kd[0] + rd.kd[1] > 0
/** A round is a "key moment" if it had a knockdown, or it is the final round shown. */
export const isKeyRound = (rounds: RoundView[], i: number) => hasKnockdown(rounds[i]) || i === rounds.length - 1

export interface Stop { /** 0-based round index */ index: number; key: boolean; ms: number }
/** Dwell time per round (ms). The only thing a mode changes. Quick = 0 → the UI jumps straight to the end. */
export const TIMING = { watch: { round: 3200, key: 3200 }, key: { round: 450, key: 3600 }, quick: { round: 0, key: 0 } } as const

export function planRounds(r: ResultView, mode: PlayMode): Stop[] {
  const rounds = r.rounds ?? []
  return rounds.map((_, i) => {
    const key = isKeyRound(rounds, i)
    return { index: i, key, ms: key ? TIMING[mode].key : TIMING[mode].round }
  })
}
export const planDuration = (r: ResultView, mode: PlayMode) => planRounds(r, mode).reduce((n, s) => n + s.ms, 0)

// ------------------------------------------------------------------------------------------------ commentary
export interface Names { a: string; b: string }
export interface CommentaryLine { id: string; round: number; tone: 'info' | 'big' | 'result'; text: string }

/** Commentary for one round: every statement is read straight from the round's recorded data. */
export function roundCommentary(rd: RoundView, names: Names, totalRounds: number): CommentaryLine[] {
  const out: CommentaryLine[] = []
  const id = (s: string) => `r${rd.n}-${s}`
  out.push({ id: id('line'), round: rd.n, tone: 'info', text: rd.line })
  const accA = rd.a.thrown ? Math.round((100 * rd.a.landed) / rd.a.thrown) : 0
  const accB = rd.b.thrown ? Math.round((100 * rd.b.landed) / rd.b.thrown) : 0
  out.push({ id: id('landed'), round: rd.n, tone: 'info', text: `${names.a} landed ${rd.a.landed} of ${rd.a.thrown} (${accA}%); ${names.b} landed ${rd.b.landed} of ${rd.b.thrown} (${accB}%).` })
  if (rd.a.power + rd.b.power > 0) out.push({ id: id('power'), round: rd.n, tone: 'info', text: `Power punches landed: ${names.a} ${rd.a.power}, ${names.b} ${rd.b.power}.` })
  if (rd.kd[0] > 0) out.push({ id: id('kd0'), round: rd.n, tone: 'big', text: `KNOCKDOWN — ${names.b} is down${rd.kd[0] > 1 ? ` (${rd.kd[0]} times this round)` : ''}.` })
  if (rd.kd[1] > 0) out.push({ id: id('kd1'), round: rd.n, tone: 'big', text: `KNOCKDOWN — ${names.a} is down${rd.kd[1] > 1 ? ` (${rd.kd[1]} times this round)` : ''}.` })
  if (rd.punish[0] === 'Heavy punishment') out.push({ id: id('p0'), round: rd.n, tone: 'info', text: `${names.a} absorbed heavy punishment in round ${rd.n}.` })
  if (rd.punish[1] === 'Heavy punishment') out.push({ id: id('p1'), round: rd.n, tone: 'info', text: `${names.b} absorbed heavy punishment in round ${rd.n}.` })
  const who = rd.winner === 0 ? names.a : rd.winner === 1 ? names.b : null
  out.push({ id: id('score'), round: rd.n, tone: 'info', text: `Round ${rd.n} of ${totalRounds} ${who ? `to ${who}` : 'even'} on the cards (${rd.cards.join(', ')}).` })
  return out
}

export const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

export interface FinishCard { kind: 'ko' | 'decision' | 'draw'; title: string; subtitle: string; winnerName: string | null; loserName: string | null; method: string; round: number; time: string | null }
/** The result card for the end of the night, from the recorded result. */
export function finishCard(r: ResultView, names: Names): FinishCard {
  const w = r.winner === null ? null : r.winner === 0 ? names.a : names.b
  const l = r.winner === null ? null : r.winner === 0 ? names.b : names.a
  if (r.winner === null) return { kind: 'draw', title: r.methodLabel.toUpperCase(), subtitle: `After ${r.round} rounds`, winnerName: null, loserName: null, method: r.methodLabel, round: r.round, time: null }
  if (r.stoppage) {
    const word = r.method === 'KO' ? 'KNOCKOUT' : r.method === 'TKO' ? 'TKO' : r.methodLabel.toUpperCase()
    return { kind: 'ko', title: `${word} · ROUND ${r.round} — ${clock(r.seconds)}`, subtitle: `${w} WINS BY ${r.method === 'KO' ? 'KO' : r.method === 'TKO' ? 'TKO' : r.methodLabel.toUpperCase()}`, winnerName: w, loserName: l, method: r.methodLabel, round: r.round, time: clock(r.seconds) }
  }
  return { kind: 'decision', title: r.methodLabel.toUpperCase(), subtitle: `${w} WINS`, winnerName: w, loserName: l, method: r.methodLabel, round: r.round, time: null }
}

/** Everything a "no presentation" and a "full presentation" run must agree on. Used by tests and the UI's own guard. */
export function resultFingerprint(r: ResultView): string {
  return JSON.stringify({ w: r.winner, m: r.method, rd: r.round, s: r.seconds, c: r.cards, kd: r.kd, st: r.stats, d: r.deductions, rounds: r.rounds })
}
