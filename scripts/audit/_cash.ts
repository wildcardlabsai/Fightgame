import { createNewGame } from '../../src/engine/worldgen'
import { advanceOneWeek } from '../../src/engine/tick'
import { newLog, playWeek, STRATEGIES } from '../../src/engine/sim/strategies'
const years = 8
for (const seed of ['b1','b2','b3','b4','b5','b6','b7','b8']) {
  let s = createNewGame({ seed, promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo: { monogram: 'P', color: '#fff', emblem: 'bolt' } }, 1_700_000_000_000)
  const log = newLog(); const out: string[] = []
  for (let w = 1; w <= years * 52; w++) { s = playWeek(s, STRATEGIES.balanced, log); s = advanceOneWeek(s); if (w % 52 === 0) out.push(Math.round(s.promotions[s.playerPromotionId].cash / 1000) + 'k') }
  console.log(seed, out.join(' '))
}
