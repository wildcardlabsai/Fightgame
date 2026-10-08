// Builds the saves the Phase 5.4 browser scripts load.
// Usage: npx tsx scripts/browser/make-phase54-fixtures.ts [outDir]
import { mkdirSync, writeFileSync } from 'node:fs'
import { advanceOneWeek } from '../../src/engine/tick'
import { createNewGame } from '../../src/engine/worldgen'
import { serialiseGame } from '../../src/engine/save'
import { newLog, playWeek, STRATEGIES } from '../../src/engine/sim/strategies'
import { titleKey, touchTitles } from '../../src/engine/media/titles'

const out = process.argv[2] ?? '/tmp/e2e'
mkdirSync(out, { recursive: true })
const logo = { monogram: 'P', color: '#d4a24c', emblem: 'bolt' as const }
const make = (seed: string, scenario?: 'regional') => createNewGame({ seed, promotionName: 'Phase Fifty-Four Promotions', promoterName: 'Tester', homeCountry: 'ENG', difficulty: 'standard', logo, scenario }, 1_700_000_000_000)

writeFileSync(`${out}/p54-new.json`, serialiseGame(make('p54-new')))
let s = make('p54-played', 'regional')
const log = newLog()
for (let w = 1; w <= 100; w++) {
  s = playWeek(s, STRATEGIES.balanced, log)
  s = advanceOneWeek(s)
  if (w === 100) writeFileSync(`${out}/p54-played.json`, serialiseGame(s))
}
// A save where the player's best fighter holds a European belt and has an open promise: the champion-side screens need something to show.
const g = structuredClone(s)
const mine = Object.values(g.contracts).filter((c) => c.promotionId === g.playerPromotionId).map((c) => g.fighters[c.fighterId]).sort((a, b) => b.reputation - a.reputation)[0]
if (mine && g.media) {
  const body = 'european'
  const k = titleKey(body, mine.weightClass)
  g.media.titles[k] = { c: mine.id, cn: `${mine.firstName} ${mine.lastName}`, since: g.today - 20 * 7, defences: 1, lastFight: g.today - 6 * 7 }
  touchTitles(g.media)
}
writeFileSync(`${out}/p54-champion.json`, serialiseGame(g))
console.log('fixtures written to', out, 'mine', mine?.id, 'roster', Object.values(s.contracts).filter((c) => c.promotionId === s.playerPromotionId).length, 'events', Object.values(s.events).filter((e) => e.promotionId === s.playerPromotionId).length)
