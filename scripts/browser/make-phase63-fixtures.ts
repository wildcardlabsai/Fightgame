// Phase 6.3 fixtures: a passive career with a live offer to stage on a rival show, and one with an accepted booking.
// Usage: npx tsx scripts/browser/make-phase63-fixtures.ts [outDir]
import { mkdirSync, writeFileSync } from 'node:fs'
import { advanceOneWeek } from '../../src/engine/tick'
import { createNewGame } from '../../src/engine/worldgen'
import { serialiseGame } from '../../src/engine/save'

const out = process.argv[2] ?? '/tmp/e2e'
mkdirSync(out, { recursive: true })
const logo = { monogram: 'P', color: '#d4a24c', emblem: 'bolt' as const }
let g = createNewGame({ seed: 'p63-world', promotionName: 'Phase 63 Promotions', promoterName: 'Tester', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
for (let i = 0; i < 104; i++) g = advanceOneWeek(g)
g.promotions[g.playerPromotionId].cash = Math.max(g.promotions[g.playerPromotionId].cash, 1_500_000)
let found: string | null = null
for (let i = 0; i < 200 && !found; i++) {
  found = Object.values(g.office!.offers).find((o) => o.status === 'open')?.id ?? null
  if (!found) g = advanceOneWeek(g)
}
if (!found) throw new Error('no offer arrived')
// keep a second live offer if there is one so decline-then-accept can be shown; the fixture is whatever the world made
writeFileSync(`${out}/p63-offer.json`, serialiseGame(g))
writeFileSync(`${out}/p63-meta.json`, JSON.stringify({ offerId: found }, null, 1))
console.log('p63 fixtures', found)
