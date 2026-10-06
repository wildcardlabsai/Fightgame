/** Balance audit driver. Only runs when BENCH is set: BENCH=out.json SEED=a YEARS=10 STRAT=balanced npx vitest run src/engine/sim/bench.test.ts */
import { writeFileSync } from 'node:fs'
import { describe, it } from 'vitest'
import type { Difficulty } from '../types'
import { runWorld } from './runner'

describe.skipIf(!process.env.BENCH)('bench', () => {
  it('runs one world', () => {
    const r = runWorld({ seed: process.env.SEED ?? 'a', years: Number(process.env.YEARS ?? 10), strategy: process.env.STRAT && process.env.STRAT !== 'passive' ? process.env.STRAT : null, difficulty: (process.env.DIFF as Difficulty) ?? 'standard', scenario: (process.env.SCEN || undefined) as never })
    writeFileSync(process.env.BENCH!, JSON.stringify(r))
  }, 3_600_000)
})
