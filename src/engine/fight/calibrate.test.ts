import { it } from 'vitest'
import { createNewGame } from '../worldgen'
import { buildSimFighter } from './profile'
import { simulateFight } from './sim'
import { Rng } from '../rng'
import { fighterRating } from '../fighters'
import type { Fighter, FightSide } from '../types'

const side = (f: Fighter): FightSide => ({ fighterId: f.id, promotionId: null, preRecord: '', preRep: 0, prePop: 0, prep: { intensity: 'normal', plan: 'balanced', campWeeks: 4, weightIssue: false, nagging: false } })

it('calibration', () => {
  const s = createNewGame({ seed: 'cal', promotionName: 'C', promoterName: 'P', homeCountry: 'ENG', difficulty: 'standard', logo: { monogram: 'C', color: '#fff', emblem: 'bolt' } })
  const act = Object.values(s.fighters).filter((f) => f.status === 'active')
  const rng = new Rng(5)
  const methods: Record<string, number> = {}
  let n = 0, kd = 0, roundSum = 0, landedPct = 0, thrown = 0, favWins = 0, favN = 0, fights10 = 0, r1 = 0, withKd = 0
  const gapBuckets: Record<string, [number, number]> = {}
  for (let i = 0; i < 4000; i++) {
    const a = rng.pick(act)
    const pool = act.filter((x) => x.id !== a.id && Math.abs(fighterRating(x) - fighterRating(a)) < 22)
    const b = rng.pick(pool)
    const A = buildSimFighter(s, a, side(a), { home: false, sizeSteps: 0 })
    const B = buildSimFighter(s, b, side(b), { home: false, sizeSteps: 0 })
    const rounds = 8
    const o = simulateFight(A, B, rounds, rng)
    n++
    methods[o.method] = (methods[o.method] ?? 0) + 1
    kd += o.kd[0] + o.kd[1]; if (o.kd[0] + o.kd[1] > 0) withKd++
    roundSum += o.round
    if (o.round === 1 && o.method !== 'UD') r1++
    thrown += o.tot[0] + o.tot[4]; landedPct += o.tot[1] + o.tot[5]
    const gap = fighterRating(a) - fighterRating(b)
    const fav = gap > 0 ? 0 : 1
    if (Math.abs(gap) >= 3 && o.winner !== null) { favN++; if (o.winner === fav) favWins++ }
    const key = String(Math.floor(Math.abs(gap) / 5) * 5)
    const bk = (gapBuckets[key] ??= [0, 0])
    if (o.winner !== null) { bk[1]++; if (o.winner === fav) bk[0]++ }
    if (rounds >= 10) fights10++
  }
  const stop = (methods.KO ?? 0) + (methods.TKO ?? 0) + (methods.RTD ?? 0) + (methods.INJ ?? 0)
  console.log('methods', JSON.stringify(methods), '\nstoppage%', (stop / n * 100).toFixed(1), 'draw%', (((methods.DRAW ?? 0) + (methods.MDRAW ?? 0) + (methods.SDRAW ?? 0)) / n * 100).toFixed(1),
    '\nkd/fight', (kd / n).toFixed(2), 'fights with kd%', (withKd / n * 100).toFixed(1), 'r1 stop%', (r1 / n * 100).toFixed(1),
    '\npunches/rd/fighter', (thrown / n / 8 / 2).toFixed(0), 'landed%', (landedPct / thrown * 100).toFixed(1), 'favourite win%', (favWins / favN * 100).toFixed(1),
    '\nby gap', Object.entries(gapBuckets).sort((x, y) => +x[0] - +y[0]).map(([k, [w, t]]) => `${k}:${(w / t * 100).toFixed(0)}%(${t})`).join(' '), fights10)
})
