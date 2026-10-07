// Builds the saves the Phase 5 browser script loads: a played game with a busy media world, and a brand-new game.
// Usage: npx tsx scripts/browser/make-phase5-fixtures.ts [outDir]
import { mkdirSync, writeFileSync } from 'node:fs'
import { advanceOneWeek } from '../../src/engine/tick'
import { createNewGame } from '../../src/engine/worldgen'
import { serialiseGame } from '../../src/engine/save'
import { newLog, playWeek, STRATEGIES } from '../../src/engine/sim/strategies'

const out = process.argv[2] ?? '/tmp/e2e'
mkdirSync(out, { recursive: true })
const logo = { monogram: 'P', color: '#d4a24c', emblem: 'bolt' as const }
const make = (seed: string, scenario?: 'regional') => createNewGame({ seed, promotionName: 'Phase Five Promotions', promoterName: 'Tester', homeCountry: 'ENG', difficulty: 'standard', logo, scenario }, 1_700_000_000_000)

writeFileSync(`${out}/p5-new.json`, serialiseGame(make('p5-new')))
let s = make('p5-played', 'regional')
const log = newLog()
const marks: Record<number, string> = { 60: 'p5-mid', 110: 'p5-played' }
for (let w = 1; w <= 110; w++) {
  s = playWeek(s, STRATEGIES.balanced, log)
  s = advanceOneWeek(s)
  if (marks[w]) writeFileSync(`${out}/${marks[w]}.json`, serialiseGame(s))
}
console.log('fixtures written to', out, 'stories', s.media!.stories.length, 'requests', s.media!.requests.length, 'offers', s.media!.offers.length, 'inbox', s.inbox.length)
