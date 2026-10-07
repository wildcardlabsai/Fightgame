import { expect, it } from 'vitest'
import { medianStepMs } from './benchTime'
import { advanceOneWeek } from './tick'
import { createNewGame } from './worldgen'

it('a week tick stays fast enough for interactive play', () => {
  let s = createNewGame({ seed: 'perf', promotionName: 'Perf', promoterName: 'P', homeCountry: 'ENG', difficulty: 'standard', logo: { monogram: 'P', color: '#fff', emblem: 'bolt' } })
  // Warm up the JIT, then take the median CPU time of eight 13-week segments (insensitive to other workers hogging the host).
  const r = medianStepMs(() => { s = advanceOneWeek(s) }, { warmup: 26, segments: 8, stepsPerSegment: 13 })
  console.log(`median cpu ms/week: ${r.median.toFixed(2)} (segments ${r.segments.map((x) => x.toFixed(1)).join(', ')}), save size: ${(JSON.stringify(s).length / 1024).toFixed(0)}kB, fighters: ${Object.keys(s.fighters).length}`)
  expect(r.median).toBeLessThan(40)
})
