import { expect, it } from 'vitest'
import { relativeStepCost } from './benchTime'
import { advanceOneWeek } from './tick'
import { createNewGame } from './worldgen'

/** Reference workload: a fixed world, cloned. Same flavour of work (allocation-heavy object graphs) as a week tick. */
export const referenceWorld = () => createNewGame({ seed: 'perf-ref', promotionName: 'Ref', promoterName: 'R', homeCountry: 'ENG', difficulty: 'standard', logo: { monogram: 'R', color: '#fff', emblem: 'bolt' } })

it('a week tick stays fast enough for interactive play (relative to host speed)', () => {
  let s = createNewGame({ seed: 'perf', promotionName: 'Perf', promoterName: 'P', homeCountry: 'ENG', difficulty: 'standard', logo: { monogram: 'P', color: '#fff', emblem: 'bolt' } })
  const ref = referenceWorld()
  const r = relativeStepCost(() => { s = advanceOneWeek(s) }, () => { structuredClone(ref) }, { warmup: 26, segments: 8, stepsPerSegment: 13 })
  console.log(`week tick = ${r.ratio.toFixed(2)}× a clone of the starting world (ref ${r.refMs.toFixed(1)} ms); wall ms/week per segment: ${r.msPerStep.map((x) => x.toFixed(0)).join(', ')}; save ${(JSON.stringify(s).length / 1024).toFixed(0)}kB, fighters ${Object.keys(s.fighters).length}`)
  expect(r.ratio).toBeLessThan(PERF_LIMIT)
}, 120_000)
/** Was 40 ms wall; on the reference host a clone of the starting world takes ~5 ms, so 40 ms ≈ 8×. Observed ≈ 6.9–7.3×; fails at ≈ +40%. */
const PERF_LIMIT = 10
