import { createNewGame } from '../../src/engine/worldgen'
import { advanceOneWeek } from '../../src/engine/tick'
import { assessChallenger } from '../../src/engine/business/contender'
import { BALANCE } from '../../src/engine/balance'
import { CONTENDER_CONFIG } from '../../src/engine/business/titleDefs'
const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
if (process.argv.includes('--baseline')) (BALANCE.fights.ai as { freeAgentFill: boolean }).freeAgentFill = false
const steps: Record<string, number> = {}
let active = 0, floor = 0, contender = 0, byPromo = { contracted: 0, free: 0 }, cFree = 0, floorFree = 0
for (const seed of [1, 2, 3, 4]) {
  let s = createNewGame({ seed: `act-${seed}`, promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
  for (let w = 1; w <= 6 * 52; w++) s = advanceOneWeek(s)
  for (const f of Object.values(s.fighters)) {
    if (f.status !== 'active') continue
    active++
    const fl = CONTENDER_CONFIG.world.floor
    const n = f.record.wins + f.record.losses + f.record.draws
    const meets = n >= fl.fights && f.record.wins >= fl.wins
    if (!meets) { steps[`below floor: ${n < fl.fights ? 'fights' : 'wins'}`] = (steps[`below floor: ${n < fl.fights ? 'fights' : 'wins'}`] ?? 0) + 1; continue }
    floor++; if (!f.contractId) floorFree++
    const a = assessChallenger(s, 'atlas', f.id)
    if (a.tier === 'contender') { contender++; if (!f.contractId) cFree++ } else steps[a.step ?? '?'] = (steps[a.step ?? '?'] ?? 0) + 1
  }
}
console.log(`active ${active}; meet world floor ${floor} (${floorFree} unsigned); credible ${contender} (${cFree} unsigned)`)
console.log(Object.entries(steps).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}\t${k}`).join('\n'))
