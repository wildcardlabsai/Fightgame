/**
 * FIGHT PRESENTATION TIMELINE.
 *
 * A deterministic list of presentation events built ONLY from the recorded result (rounds, counts, controls, cards, method).
 * The simulation ran once, before any of this exists; nothing here draws a random number, calls the engine, or writes state.
 * Watch, Key events, Replay and every playback speed are just different ways of walking this same list, so they can never
 * disagree about what happened. Speed only scales how fast the clock advances through the list.
 */
import type { ResultView, RoundView } from '../engine/fightViews'
import { clock, hasKnockdown, knockdownSteps, type Names } from './fightPlayback'

export type EvType = 'intro' | 'roundStart' | 'action' | 'hurt' | 'knockdown' | 'roundEnd' | 'momentum' | 'standout' | 'stoppage' | 'decision' | 'result'
export type Sfx = 'intro' | 'round' | 'action' | 'knockdown' | 'stoppage' | 'finish' | null
export interface TlStep { text: string; sub: string; ms: number }

export interface TlEvent {
  id: string
  type: EvType
  /** 1-based round (0 for fight-level events). */
  round: number
  /** Shown in the Key events highlight reel. */
  key: boolean
  title: string
  detail: string
  /** Duration at 1× speed. */
  ms: number
  /** Rounds whose statistics are visible while this event plays (before `revealAt`) and after it. */
  during: number
  reveal: number
  /** Fraction of `ms` at which `reveal` replaces `during` (round-end events count their numbers up first). */
  revealAt: number
  steps?: TlStep[]
  /** Which fighter the event is about (0 = A, 1 = B), when it is about one. */
  side: 0 | 1 | null
  sfx: Sfx
  /** Round clock (seconds) at the start and end of the event, for the round timer. */
  clock: [number, number]
}

export interface TimelineInput {
  fightId: string
  result: ResultView
  names: Names
  title?: { label: string; titleName: string } | null
  reduced?: boolean
}

const MS = { intro: 2400, roundStart: 900, action: 1700, hurt: 1700, momentum: 1700, standout: 2000, roundEnd: 1900, stoppage: 2400, result: 2600 }

export function buildTimeline(inp: TimelineInput): TlEvent[] {
  const r = inp.result
  const rounds = r.rounds ?? []
  const n = inp.names
  const who = (s: 0 | 1) => (s === 0 ? n.a : n.b)
  const ev: TlEvent[] = []
  const add = (e: Omit<TlEvent, 'id' | 'revealAt' | 'steps' | 'side' | 'clock' | 'sfx'> & Partial<Pick<TlEvent, 'revealAt' | 'steps' | 'side' | 'sfx'>>) =>
    ev.push({ revealAt: 0, steps: undefined, side: null, sfx: null, clock: [0, 0], ...e, id: `${e.type}-${e.round}-${ev.length}` })

  add({ type: 'intro', round: 0, key: !!inp.title, title: inp.title ? inp.title.label : 'FIGHT NIGHT', detail: inp.title ? `${inp.title.titleName} — ${n.a} vs ${n.b}` : `${n.a} vs ${n.b}`, ms: MS.intro, during: 0, reveal: 0, sfx: 'intro' })

  let prevControl: number | null = rounds[0]?.control ? rounds[0].control[0] : null
  const lastIdx = rounds.length - 1
  rounds.forEach((rd, i) => {
    const rn = rd.n
    add({ type: 'roundStart', round: rn, key: false, title: `ROUND ${rn}`, detail: `Round ${rn} of ${rounds.length}`, ms: MS.roundStart, during: i, reveal: i, sfx: 'round' })
    // notable action: a clear power-punch advantage recorded for the round
    const pa = rd.a.power, pb = rd.b.power
    if (!hasKnockdown(rd) && Math.max(pa, pb) >= 6 && Math.max(pa, pb) >= 1.5 * Math.min(pa, pb) + 1) {
      const s: 0 | 1 = pa > pb ? 0 : 1
      add({ type: 'action', round: rn, key: false, title: 'POWER SHOTS', detail: `${who(s)} lands ${Math.max(pa, pb)} power punches to ${Math.min(pa, pb)}.`, ms: MS.action, during: i, reveal: i, side: s, sfx: 'action' })
    }
    // hurt (recorded heavy punishment, not already a knockdown round)
    ;([0, 1] as const).forEach((s) => {
      if (rd.punish[s] === 'Heavy punishment' && !hasKnockdown(rd)) add({ type: 'hurt', round: rn, key: true, title: 'FIGHTER HURT', detail: `${who(s)} is badly hurt in round ${rn}.`, ms: MS.hurt, during: i, reveal: i, side: s, sfx: 'action' })
    })
    // knockdowns from the recorded referee counts (or a plain banner on older fights)
    if (hasKnockdown(rd)) {
      const steps = knockdownSteps(rd, n, !!inp.reduced)
      const down: 0 | 1 = rd.counts[0] ? rd.counts[0].down : rd.kd[0] > 0 ? 1 : 0
      const attacker = who(down === 0 ? 1 : 0)
      add({
        type: 'knockdown', round: rn, key: true, title: 'KNOCKDOWN', detail: `${attacker} drops ${who(down)} in round ${rn}.${rd.counts.length ? ` Count reached ${rd.counts[rd.counts.length - 1].count}.` : ''}`,
        ms: steps.reduce((m, s) => m + s.ms, 0) + 400, during: i, reveal: i, steps, side: down, sfx: 'knockdown',
      })
    }
    // the end of the round: numbers and scores count up
    add({ type: 'roundEnd', round: rn, key: i === lastIdx && !r.stoppage && r.cards.length === 0, title: `END OF ROUND ${rn}`, detail: rd.line, ms: MS.roundEnd, during: i, reveal: i + 1, revealAt: 0.2, sfx: null })
    // momentum shift (recorded control crossing the middle between rounds)
    const c = rd.control ? rd.control[1] : null
    if (c !== null && prevControl !== null && i < lastIdx) {
      const flipped = (prevControl >= 55 && c <= 45) || (prevControl <= 45 && c >= 55)
      if (flipped) { const s: 0 | 1 = c >= 55 ? 0 : 1; add({ type: 'momentum', round: rn, key: true, title: 'MOMENTUM SHIFT', detail: `${who(s)} begins controlling the fight.`, ms: MS.momentum, during: i + 1, reveal: i + 1, side: s, sfx: null }) }
    }
    if (c !== null) prevControl = c
  })

  // a fight with little recorded drama still gets a highlight: its standout round
  const drama = ev.filter((e) => e.key).length
  if (drama < 2 && rounds.length > 0) {
    let best = 0, bestScore = -1
    rounds.forEach((rd, i) => { const sc = rd.a.landed + rd.b.landed + 4 * (rd.a.power + rd.b.power); if (sc > bestScore) { bestScore = sc; best = i } })
    const rd = rounds[best]
    const idx = ev.findIndex((e) => e.type === 'roundEnd' && e.round === rd.n)
    const lead: 0 | 1 | null = rd.winner === 2 ? null : (rd.winner as 0 | 1)
    ev.splice(idx + 1, 0, { id: `standout-${rd.n}`, type: 'standout', round: rd.n, key: true, title: 'ROUND OF THE FIGHT', detail: `Round ${rd.n}: ${n.a} ${rd.a.landed}/${rd.a.thrown}, ${n.b} ${rd.b.landed}/${rd.b.thrown} landed${lead !== null ? ` — ${who(lead)} takes it` : ''}.`, ms: MS.standout, during: best + 1, reveal: best + 1, revealAt: 0, steps: undefined, side: lead, sfx: null, clock: [0, 0] })
  }

  // how it ended
  if (r.winner !== null && r.stoppage) {
    const loser = r.winner === 0 ? n.b : n.a, winner = r.winner === 0 ? n.a : n.b
    const word: Record<string, [string, string]> = {
      KO: ['KNOCKOUT', `${loser} is counted out. ${winner} wins by knockout.`],
      TKO: ['STOPPAGE', `The referee stops the contest. ${winner} wins by TKO.`],
      RTD: ['CORNER RETIREMENT', `${loser}'s corner retires them. ${winner} wins.`],
      INJ: ['INJURY STOPPAGE', `${loser} cannot continue. ${winner} wins.`],
    }
    const [t, d] = word[r.method] ?? ['STOPPAGE', `${winner} wins by ${r.methodLabel}.`]
    add({ type: 'stoppage', round: r.round, key: true, title: t, detail: `${d} Round ${r.round}, ${clock(r.seconds)}.`, ms: MS.stoppage, during: rounds.length, reveal: rounds.length, side: r.winner === 0 ? 1 : 0, sfx: 'stoppage' })
  } else {
    const steps: TlStep[] = [
      ...(r.cards.length ? r.cards.map((c, i) => ({ text: `JUDGE ${i + 1}`, sub: `${c.a} – ${c.b}`, ms: 900 })) : []),
      { text: r.winner === null ? r.methodLabel.toUpperCase() : `${r.winner === 0 ? n.a : n.b} WINS`.toUpperCase(), sub: r.methodLabel, ms: 1400 },
    ]
    add({ type: 'decision', round: r.round, key: true, title: r.winner === null ? 'DRAW' : 'DECISION', detail: `${r.methodLabel} after ${r.round} rounds.`, ms: steps.reduce((m, s) => m + s.ms, 0), during: rounds.length, reveal: rounds.length, steps, side: r.winner === null ? null : r.winner, sfx: 'finish' })
  }
  add({ type: 'result', round: r.round, key: true, title: 'FINAL RESULT', detail: r.headline, ms: MS.result, during: rounds.length, reveal: rounds.length, side: r.winner, sfx: null })

  // round clock: spread each round's events across its length (the stoppage round ends at the recorded time)
  for (const rd of rounds) {
    const evs = ev.filter((e) => e.round === rd.n && e.type !== 'stoppage' && e.type !== 'decision' && e.type !== 'result' && e.type !== 'momentum' && e.type !== 'standout')
    const total = evs.reduce((m, e) => m + e.ms, 0) || 1
    const end = r.stoppage && rd.n === r.round ? r.seconds : 180
    let acc = 0
    for (const e of evs) { const a = (acc / total) * end; acc += e.ms; e.clock = [Math.round(a), Math.round(e.type === 'roundEnd' ? end : (acc / total) * end)] }
  }
  return ev
}

export const keyEvents = (tl: TlEvent[]) => tl.filter((e) => e.key)

// ------------------------------------------------------------------------------------------------ playback clock
export interface Playback { pos: number; acc: number; done: boolean }
export const startPlayback = (tl: TlEvent[]): Playback => ({ pos: 0, acc: 0, done: tl.length === 0 })
export const SPEEDS = [0.5, 1, 2, 4, 8] as const
export type Speed = (typeof SPEEDS)[number]

/** Advance the presentation clock by `dtMs` of REAL time at `speed`×. Pure. Speed only scales dt; it never changes what is played. */
export function advance(tl: TlEvent[], s: Playback, dtMs: number, speed: number): Playback {
  if (s.done) return s
  let acc = s.acc + Math.max(0, dtMs) * speed
  let pos = s.pos
  while (pos < tl.length && acc >= tl[pos].ms) { acc -= tl[pos].ms; pos++ }
  return pos >= tl.length ? { pos: tl.length, acc: 0, done: true } : { pos, acc, done: false }
}
export const finish = (tl: TlEvent[]): Playback => ({ pos: tl.length, acc: 0, done: true })
/** Jump to the start of the next event (Key events: "next"). */
export const nextEvent = (tl: TlEvent[], s: Playback): Playback => (s.pos + 1 >= tl.length ? finish(tl) : { pos: s.pos + 1, acc: 0, done: false })
export const restartEvent = (s: Playback): Playback => ({ ...s, acc: 0, done: false })
export const previousEvent = (s: Playback): Playback => ({ pos: Math.max(0, s.pos - (s.acc > 400 ? 0 : 1)), acc: 0, done: false })

/** Which step of an event's sequence (knockdown count, judges' cards) is showing, and how far through the event we are. */
export function stepAt(e: TlEvent, acc: number): { index: number; step: TlStep | null } {
  if (!e.steps?.length) return { index: -1, step: null }
  let t = 0
  for (let i = 0; i < e.steps.length; i++) { t += e.steps[i].ms; if (acc < t) return { index: i, step: e.steps[i] } }
  return { index: e.steps.length - 1, step: e.steps[e.steps.length - 1] }
}
/** Rounds whose statistics are showing right now. */
export const shownRounds = (e: TlEvent | undefined, acc: number, total: number) => (!e ? total : acc >= e.revealAt * e.ms ? e.reveal : e.during)
/** Round clock (seconds) now. */
export function clockNow(e: TlEvent | undefined, acc: number): number { if (!e) return 0; const f = Math.min(1, acc / Math.max(1, e.ms)); return Math.round(e.clock[0] + (e.clock[1] - e.clock[0]) * f) }
export const roundOf = (tl: TlEvent[], pos: number) => tl[Math.min(pos, tl.length - 1)]?.round ?? 0
export type { RoundView }
