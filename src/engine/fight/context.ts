/**
 * CAREER CONTEXT FOR A RESULT. The same result does not mean the same thing to every fighter: a prospect beating a stronger name is a
 * breakthrough, an unbeaten fighter's first defeat lands hard, a heavy favourite beaten by a lesser name is a real setback, a veteran
 * has seen it before, and a run of results (three wins, three defeats) compounds. This module turns those public facts into small,
 * bounded multipliers that `processResult` applies on top of the expectation-based effects it already computes. Nothing here is
 * hidden: every factor comes from the record, age, public reputation and the pre-fight expectation, and each one has a plain reason.
 */
import { fighterAge } from '../fighters'
import type { Fighter, GameState, Id } from '../types'

export type CareerStage = 'prospect' | 'prime' | 'veteran'
export interface Streak { kind: 'win' | 'loss' | null; n: number }

export const careerStage = (f: Fighter, today: number): CareerStage => {
  const age = fighterAge(f, today)
  const n = f.record.wins + f.record.losses + f.record.draws
  return age >= 33 ? 'veteran' : n <= 12 && age <= 27 ? 'prospect' : 'prime'
}

/** The run of results going into a fight (not counting it): newest first, draws and unreadable bouts end the run. */
export function streakBefore(state: GameState, f: Fighter, exceptFight: Id): Streak {
  let kind: Streak['kind'] = null, n = 0
  for (let i = f.recentFights.length - 1; i >= 0; i--) {
    const id = f.recentFights[i]
    if (id === exceptFight) continue
    const x = state.fights[id]
    if (!x?.result || x.result.winner === null) break
    const won = (x.result.winner === 0) === (x.sideA.fighterId === f.id)
    const k: 'win' | 'loss' = won ? 'win' : 'loss'
    if (kind === null) kind = k
    if (k !== kind) break
    n++
  }
  return { kind, n }
}

export interface ResultContext { rep: number; pop: number; morale: number; conf: number; /** extra momentum, added */ mom: number; notes: string[] }
const lim = (v: number) => Math.max(0.7, Math.min(1.35, v))

export function resultContext(state: GameState, f: Fighter, opp: Fighter, res: 'win' | 'loss' | 'draw', pWin: number, prior: Streak): ResultContext {
  const c: ResultContext = { rep: 1, pop: 1, morale: 1, conf: 1, mom: 0, notes: [] }
  if (res === 'draw') return c
  const stage = careerStage(f, state.today)
  if (res === 'win') {
    if (stage === 'prospect' && pWin < 0.5) { const k = 1 + 0.6 * (0.5 - pWin); c.pop *= k; c.conf *= k; c.rep *= 1 + 0.3 * (0.5 - pWin); if (pWin < 0.4) c.notes.push('A young fighter beating a stronger name: the public takes notice') }
    if (stage === 'veteran') { if (pWin > 0.6) { c.pop *= 0.9; c.notes.push('An expected win adds little to an established name') } else if (pWin < 0.4) { c.rep *= 1.15; c.notes.push('Beating the odds late in a career carries weight') } }
    if (prior.kind === 'win' && prior.n >= 2) { c.pop *= 1.1; c.mom += 8; c.notes.push(`${prior.n + 1} wins in a row`) }
    if (prior.kind === 'loss' && prior.n >= 2) { c.morale *= 1.15; c.notes.push('A win that ends a bad run') }
  } else {
    if (f.record.losses === 0 && f.record.draws === 0 && f.record.wins >= 3 && stage !== 'veteran') { c.morale *= 1.3; c.conf *= 1.3; c.pop *= 1.25; c.notes.push('First defeat after an unbeaten run') }
    if (pWin >= 0.65 && opp.reputation < f.reputation - 8) { c.rep *= 1.25; c.notes.push('A heavy favourite beaten by a lesser name') }
    if (stage === 'veteran') { c.morale *= 0.85; c.conf *= 0.9; if (f.reputation >= 55) { c.rep *= 1.1; c.notes.push('A famous name slipping') } }
    if (stage === 'prospect' && pWin < 0.4) { c.rep *= 0.8; c.morale *= 0.85; c.notes.push('Losing to a better fighter is part of a young career') }
    if (prior.kind === 'loss' && prior.n >= 2) { c.morale *= 1.15; c.mom -= 10; c.notes.push(`${prior.n + 1} defeats in a row`) }
  }
  c.rep = lim(c.rep); c.pop = lim(c.pop); c.morale = lim(c.morale); c.conf = lim(c.conf)
  return c
}
