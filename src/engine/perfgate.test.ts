/** The performance gate's decision rule, tested on its own with synthetic repetitions (fast; no wall-clock). */
import { describe, expect, it } from 'vitest'
import { gateDecision } from './benchTime'

// A representative sample (not the raw data) of single-run ratios on one unchanged build: scripts/audit/phase9-perf.ts measured 24 single runs of the current tree between 6.2 and 9.6, median ~7.0
const NOISY_HEALTHY = [6.6, 7.0, 9.1, 6.3, 7.4, 8.7, 6.6, 9.5, 6.9, 7.2]

describe('gate decision rule', () => {
  it('a healthy but noisy build passes, however the repetitions are sampled', () => {
    for (let start = 0; start + 5 <= NOISY_HEALTHY.length; start++) expect(gateDecision(NOISY_HEALTHY.slice(start, start + 5), 10).pass, `window ${start}`).toBe(true)
  })
  it('a real slowdown moves every repetition and fails: +45% on the same distribution', () => {
    for (let start = 0; start + 5 <= NOISY_HEALTHY.length; start++) expect(gateDecision(NOISY_HEALTHY.slice(start, start + 5).map((x) => x * 1.45), 10).pass, `window ${start}`).toBe(false)
  })
  it('one wild repetition cannot flip a healthy build, and one lucky repetition cannot rescue a slow one', () => {
    expect(gateDecision([7, 7.1, 6.9, 30, 7.2], 10).pass).toBe(true)
    expect(gateDecision([14, 13.5, 14.2, 4, 13.8], 10).pass).toBe(false)
  })
  it('the statistic is the median of the repetition medians and the distribution is reported', () => {
    const d = gateDecision([9, 8, 11, 7, 12], 10)
    expect(d.statistic).toBe(9); expect(d.min).toBe(7); expect(d.max).toBe(12); expect(d.reps).toHaveLength(5)
    expect(d.pass).toBe(true)
  })
  it('the limit itself is the established 10×', async () => {
    const src = (await import('node:fs')).readFileSync(new URL('./perf.test.ts', import.meta.url), 'utf8')
    expect(src).toMatch(/const PERF_LIMIT = 10\b/)
  })
})
