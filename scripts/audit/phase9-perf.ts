/**
 * Phase 9: controlled performance measurement. One process = R independent repetitions of the gate's own benchmark (fresh world, same seed and method as
 * src/engine/perf.test.ts) plus an AGED-state benchmark (a six-year-old world ticked from the same state each time). Reports the distribution, never just
 * the best run. Usage: npx tsx scripts/audit/phase9-perf.ts [reps=8] [agedYears=6]
 */
import { relativeStepCost } from '../../src/engine/benchTime'
import { advanceOneWeek } from '../../src/engine/tick'
import { createNewGame } from '../../src/engine/worldgen'

const reps = Number(process.argv[2] ?? 8), agedYears = Number(process.argv[3] ?? 6)
const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const world = (seed: string) => createNewGame({ seed, promotionName: 'Perf', promoterName: 'P', homeCountry: 'ENG', difficulty: 'standard', logo })
const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
const fmt = (xs: number[]) => `min ${Math.min(...xs).toFixed(2)}  p25 ${q(xs, 0.25).toFixed(2)}  median ${q(xs, 0.5).toFixed(2)}  p75 ${q(xs, 0.75).toFixed(2)}  max ${Math.max(...xs).toFixed(2)}`

const ratios: number[] = [], refs: number[] = [], ticks: number[] = []
const ref = world('perf-ref')
for (let r = 0; r < reps; r++) {
  let s = world('perf')
  const res = relativeStepCost(() => { s = advanceOneWeek(s) }, () => { structuredClone(ref) }, { warmup: 26, segments: 8, stepsPerSegment: 13 })
  ratios.push(res.ratio); refs.push(res.refMs); ticks.push(res.msPerStep.reduce((a, b) => a + b, 0) / res.msPerStep.length)
}
console.log(`gate benchmark x${reps}`)
console.log('  ratio (limit 10):      ', fmt(ratios))
console.log('  reference clone ms:    ', fmt(refs))
console.log('  tick ms (fresh world): ', fmt(ticks))

let aged = world('aged')
for (let w = 0; w < agedYears * 52; w++) aged = advanceOneWeek(aged)
const agedMs: number[] = []
for (let r = 0; r < 5; r++) {
  let s = aged
  for (let w = 0; w < 4; w++) s = advanceOneWeek(s) // warm
  const t0 = performance.now(); s = aged
  for (let w = 0; w < 26; w++) s = advanceOneWeek(s)
  agedMs.push((performance.now() - t0) / 26)
}
console.log(`aged-state benchmark (${agedYears}y world, 26 ticks from the same state) x5, ${(JSON.stringify(aged).length / 1e6).toFixed(2)} MB JSON, ${Object.keys(aged.fights).length} fights`)
console.log('  tick ms (aged world):  ', fmt(agedMs))
