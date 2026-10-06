import { expect, it } from 'vitest'
import { advanceOneWeek } from './tick'
import { createNewGame } from './worldgen'

it('a week tick stays fast enough for interactive play', () => {
  let s = createNewGame({ seed: 'perf', promotionName: 'Perf', promoterName: 'P', homeCountry: 'ENG', difficulty: 'standard', logo: { monogram: 'P', color: '#fff', emblem: 'bolt' } })
  const t0 = performance.now()
  for (let i = 0; i < 104; i++) s = advanceOneWeek(s)
  const perWeek = (performance.now() - t0) / 104
  console.log(`avg ms/week: ${perWeek.toFixed(2)}, save size: ${(JSON.stringify(s).length / 1024).toFixed(0)}kB, fighters: ${Object.keys(s.fighters).length}`)
  expect(perWeek).toBeLessThan(40)
})
