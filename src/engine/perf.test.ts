import { expect, it } from 'vitest'
import { gateDecision, median, now, relativeStepCost } from './benchTime'
import { advanceOneWeek } from './tick'
import { createNewGame } from './worldgen'

/** Reference workload: a fixed world, cloned. Same flavour of work (allocation-heavy object graphs) as a week tick. */
export const referenceWorld = () => createNewGame({ seed: 'perf-ref', promotionName: 'Ref', promoterName: 'R', homeCountry: 'ENG', difficulty: 'standard', logo: { monogram: 'R', color: '#fff', emblem: 'bolt' } })

const fresh = () => createNewGame({ seed: 'perf', promotionName: 'Perf', promoterName: 'P', homeCountry: 'ENG', difficulty: 'standard', logo: { monogram: 'P', color: '#fff', emblem: 'bolt' } })

/** One repetition of the benchmark: a fresh world, warm-up, 8 timed segments of 13 weeks, each normalised by the reference clone measured around it. `extra` adds artificial work per tick (a slowdown, for the sensitivity test). */
function repetition(ref: ReturnType<typeof referenceWorld>, extra = 0) {
  let s = fresh()
  return relativeStepCost(() => {
    const t0 = now(); s = advanceOneWeek(s)
    if (extra > 0) { const spin = (now() - t0) * extra; const end = now() + spin; while (now() < end) { /* the slowdown */ } }
  }, () => { structuredClone(ref) }, { warmup: 26, segments: 8, stepsPerSegment: 13 })
}

it('a week tick stays fast enough for interactive play (relative to host speed; decided on repetitions)', () => {
  const ref = referenceWorld()
  const reps = Array.from({ length: REPS }, () => repetition(ref))
  const d = gateDecision(reps.map((r) => r.ratio), PERF_LIMIT)
  console.log(`week tick = ${d.statistic.toFixed(2)}× a clone of the starting world (median of ${REPS} repetitions; limit ${PERF_LIMIT}); repetitions ${d.reps.map((x) => x.toFixed(2)).join(', ')} (min ${d.min.toFixed(2)}, max ${d.max.toFixed(2)}); ms/week ${median(reps.flatMap((r) => r.msPerStep)).toFixed(0)}`)
  expect(d.statistic).toBeLessThan(PERF_LIMIT)
}, 240_000)

it('the gate would notice a real slowdown: +60% work per tick moves the statistic up by about that much, on this host, in this run', () => {
  const ref = referenceWorld()
  const base = gateDecision(Array.from({ length: 3 }, () => repetition(ref).ratio), PERF_LIMIT).statistic
  const slow = gateDecision(Array.from({ length: 3 }, () => repetition(ref, 0.6).ratio), PERF_LIMIT).statistic
  console.log(`sensitivity: unchanged ${base.toFixed(2)}×, +60% work ${slow.toFixed(2)}× (ratio ${(slow / base).toFixed(2)})`)
  expect(slow / base).toBeGreaterThan(1.35)
}, 240_000)

const REPS = 5
/** Was 40 ms wall; on the reference host a clone of the starting world takes ~5 ms, so 40 ms ≈ 8×. The limit is unchanged; the decision is now taken on the median of repetitions (benchTime.ts). */
const PERF_LIMIT = 10
