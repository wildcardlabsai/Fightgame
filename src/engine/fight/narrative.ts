/**
 * Text for fights, generated from COMPACT RESULT DATA only (round beats, stats, method).
 * Nothing here has access to hidden attributes, so reports cannot leak them.
 */
import type { Fight, FightMethod, RoundRec } from '../types'
import { BEAT } from './sim'

export const METHOD_LABEL: Record<FightMethod, string> = {
  UD: 'Unanimous decision', MD: 'Majority decision', SD: 'Split decision', DRAW: 'Draw', MDRAW: 'Majority draw', SDRAW: 'Split draw',
  KO: 'Knockout', TKO: 'TKO', RTD: 'Corner retirement', INJ: 'Injury stoppage',
}

export const METHOD_SHORT: Record<FightMethod, string> = {
  UD: 'UD', MD: 'MD', SD: 'SD', DRAW: 'Draw', MDRAW: 'MD', SDRAW: 'SD', KO: 'KO', TKO: 'TKO', RTD: 'RTD', INJ: 'TKO',
}

export function isStoppage(m: FightMethod): boolean {
  return m === 'KO' || m === 'TKO' || m === 'RTD' || m === 'INJ'
}

const pick = <T,>(arr: T[], i: number): T => arr[i % arr.length]

export function roundLine(rec: RoundRec, i: number, nA: string, nB: string): string {
  const [side, beat] = rec.b
  const W = side === 0 ? nA : nB
  const L = side === 0 ? nB : nA
  const kdW = side === 0 ? rec.k[0] : rec.k[1]
  switch (beat) {
    case BEAT.KNOCKDOWN: return kdW > 1 ? `${W} put ${L} down twice in a big round.` : pick([`${W} dropped ${L} with a heavy shot.`, `A knockdown! ${W} sent ${L} to the canvas.`], i)
    case BEAT.DOMINATED: return pick([`${W} dominated the round from start to finish.`, `${L} had no answers as ${W} took complete control.`], i)
    case BEAT.HURT: return pick([`${W} hurt ${L} and had them in trouble.`, `${L} was rocked and had to hold on.`], i)
    case BEAT.FADING: return pick([`${L} began to slow; ${W} took over.`, `The pace told on ${L} as ${W} pulled ahead.`], i)
    case BEAT.COMEBACK: return pick([`${W} came back into the fight.`, `${W} turned the momentum around.`], i)
    case BEAT.COUNTERS: return pick([`${W} landed clean counters as ${L} came forward.`, `${W} timed ${L} with sharp counter shots.`], i)
    case BEAT.BUSY: return pick([`${W} out-worked ${L} with a busier round.`, `${W} let the hands go and won the volume battle.`], i)
    case BEAT.DISTANCE: return pick([`${W} controlled the distance behind the jab.`, `${W} boxed smartly from range to take the round.`], i)
    case BEAT.SURVIVED: return `A wild round — both fighters were in trouble at times.`
    default: return pick(['A close, even round.', 'Hard to separate them in this one.'], i)
  }
}

export function resultHeadline(fight: Fight, nA: string, nB: string): string {
  const r = fight.result
  if (!r) return `${nA} vs ${nB}`
  if (r.winner === null) return `${nA} and ${nB} fight to a ${r.method === 'DRAW' ? 'draw' : r.method === 'MDRAW' ? 'majority draw' : 'split draw'}`
  const W = r.winner === 0 ? nA : nB
  const L = r.winner === 0 ? nB : nA
  const m = r.method
  if (m === 'KO') return `${W} knocks out ${L} in round ${r.round}`
  if (m === 'TKO') return `${W} stops ${L} in round ${r.round}`
  if (m === 'RTD') return `${W} forces ${L}'s corner to retire in round ${r.round}`
  if (m === 'INJ') return `${W} wins as ${L} cannot continue in round ${r.round}`
  return `${W} beats ${L} by ${METHOD_LABEL[m].toLowerCase()}`
}

/** Short paragraph used at the top of the report. */
export function resultSummary(fight: Fight, nA: string, nB: string): string {
  const r = fight.result
  if (!r) return ''
  const kdTotal = r.kd[0] + r.kd[1]
  const W = r.winner === 0 ? nA : nB
  const L = r.winner === 0 ? nB : nA
  const wi: number = r.winner === null ? -1 : r.winner
  const kdByW: number = wi >= 0 ? (r.kd[wi as 0 | 1] ?? 0) : 0
  const kdByL: number = wi >= 0 ? (r.kd[(1 - wi) as 0 | 1] ?? 0) : 0
  const parts: string[] = []
  if (r.winner === null) {
    parts.push(`After ${fight.scheduledRounds} rounds the judges could not separate them.`)
    if (kdTotal > 0) parts.push(`There ${kdTotal === 1 ? 'was one knockdown' : `were ${kdTotal} knockdowns`} on the night.`)
    return parts.join(' ')
  }
  if (isStoppage(r.method)) {
    if (r.method === 'KO') parts.push(`${W} knocked ${L} out in round ${r.round}.`)
    else if (r.method === 'RTD') parts.push(`${L}'s corner called a halt after round ${r.round}.`)
    else if (r.method === 'INJ') parts.push(`${L} was unable to continue in round ${r.round} because of injury.`)
    else parts.push(`The referee stopped the contest in round ${r.round} to save ${L} from further punishment.`)
    if (kdByW > 0) parts.push(`${W} put ${L} down ${kdByW === 1 ? 'once' : `${kdByW} times`}.`)
    if (kdByL > 0) parts.push(`${L} had ${kdByL === 1 ? 'dropped' : 'twice dropped'} ${W} earlier in the fight.`)
  } else {
    parts.push(`${W} won over ${fight.scheduledRounds} rounds by ${METHOD_LABEL[r.method].toLowerCase()}.`)
    if (kdTotal > 0) parts.push(`There ${kdTotal === 1 ? 'was a knockdown' : `were ${kdTotal} knockdowns`} along the way.`)
  }
  return parts.join(' ')
}

export function punishmentLabel(p: number): string {
  return p >= 7 ? 'Heavy punishment' : p >= 4 ? 'Took some damage' : p >= 2 ? 'Light damage' : 'Barely marked'
}

export function performanceNote(name: string, landed: number, thrown: number, oppLanded: number, power: number, kd: number, won: boolean | null): string {
  const acc = thrown ? Math.round((landed / thrown) * 100) : 0
  const edge = landed - oppLanded
  const bits: string[] = []
  bits.push(edge > 8 ? `${name} out-landed the opposition ${landed}–${oppLanded}` : edge < -8 ? `${name} was out-landed ${landed}–${oppLanded}` : `${name} and the opponent landed almost evenly (${landed}–${oppLanded})`)
  bits.push(`${acc}% accuracy`)
  if (power >= 25) bits.push('a heavy power-punch count')
  if (kd > 0) bits.push(`${kd} knockdown${kd > 1 ? 's' : ''}`)
  return bits.join(', ') + (won === true ? ' in victory.' : won === false ? ' in defeat.' : '.')
}
