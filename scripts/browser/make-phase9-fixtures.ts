// Phase 9 fixtures: a regional career 26 weeks in (a busy inbox with offers, requests and tips) for the inbox checks.
// Usage: npx tsx scripts/browser/make-phase9-fixtures.ts [outDir]
import { writeFileSync } from 'node:fs'
import { createNewGame } from '../../src/engine/worldgen'
import { advanceOneWeek } from '../../src/engine/tick'
import { serialiseGame } from '../../src/engine/save'
import { inboxItems, inboxSummary } from '../../src/engine/inboxViews'

const out = process.argv[2] ?? '/tmp/e2e'
let s = createNewGame({ seed: 'p9-inbox-ui', promotionName: 'Ironbridge Boxing', promoterName: 'Sam Reid', homeCountry: 'ENG', difficulty: 'standard', logo: { emblem: 'glove', color: '#e11d2a', monogram: 'IB' }, scenario: 'regional' }, 1)
for (let i = 0; i < 26; i++) s = advanceOneWeek(s)
writeFileSync(`${out}/p9-inbox.json`, serialiseGame(s))
const sum = inboxSummary(s, inboxItems(s))
console.log('messages', s.inbox.length, 'open decisions', sum.open, JSON.stringify(sum.total))
writeFileSync(`${out}/p9-meta.json`, JSON.stringify({ messages: s.inbox.length, open: sum.open, total: sum.total }))
