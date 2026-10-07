/**
 * Golden digest of the fight simulation's DECIDED outcomes. Phase 4.9 added recording (stamina, control, knockdown counts)
 * to the simulation; recording must never move an outcome, so this digest — captured before that change — must not change.
 */
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { createNewGame } from '../worldgen'
import { buildSimFighter } from './profile'
import { simulateFight } from './sim'
import { Rng } from '../rng'
import type { Fighter, FightSide } from '../types'

const side = (f: Fighter): FightSide => ({ fighterId: f.id, promotionId: null, preRecord: '', preRep: 0, prePop: 0, prep: { intensity: 'normal', plan: 'balanced', campWeeks: 4, weightIssue: false, nagging: false } })

export function digest(n = 250): string {
  const s = createNewGame({ seed: 'golden', promotionName: 'C', promoterName: 'P', homeCountry: 'ENG', difficulty: 'standard', logo: { monogram: 'C', color: '#fff', emblem: 'bolt' } })
  const act = Object.values(s.fighters).filter((f) => f.status === 'active')
  const rng = new Rng(77)
  const h = createHash('sha256')
  for (let i = 0; i < n; i++) {
    const a = rng.pick(act), b = rng.pick(act.filter((x) => x.id !== a.id))
    const o = simulateFight(buildSimFighter(s, a, side(a), { home: false, sizeSteps: 0 }), buildSimFighter(s, b, side(b), { home: false, sizeSteps: 0 }), 4 + (i % 9), rng)
    h.update(JSON.stringify({ w: o.winner, m: o.method, r: o.round, s: o.second, c: o.cards, kd: o.kd, t: o.tot, d: o.deductions, p: o.perf, rounds: o.rounds.map((r) => ({ t: r.t, k: r.k, s: r.s, b: r.b, p: r.p })) }))
    h.update(String(rng.next()))
  }
  return h.digest('hex')
}

it('simulation outcomes are byte-identical to the pre-4.9 golden digest', () => {
  expect(digest()).toBe('749bf03f69397d47909c30dbc46084e4d4ad9c34544cec94bdf086f00fe033f7')
})
