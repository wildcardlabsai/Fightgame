/** Career audit driver (Phase 4.6). CAREERS=out.json SEEDS=a,b YEARS=12 npx vitest run src/engine/sim/careers.test.ts */
import { writeFileSync } from 'node:fs'
import { describe, it } from 'vitest'
import { runCareers } from './careers'

describe.skipIf(!process.env.CAREERS)('careers', () => {
  it('tracks careers', () => {
    const all = (process.env.SEEDS ?? 'a').split(',').map((seed) => runCareers({ seed, years: Number(process.env.YEARS ?? 12), strategy: process.env.STRAT || null }))
    writeFileSync(process.env.CAREERS!, JSON.stringify(all))
  }, 3_600_000)
})
