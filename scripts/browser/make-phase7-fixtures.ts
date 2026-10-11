// Phase 7 fixtures: a guided new career at several points of the first show, plus an established (pre-guide, v12) save.
// Usage: npx tsx scripts/browser/make-phase7-fixtures.ts [outDir]
import { writeFileSync } from 'node:fs'
import { createNewGame } from '../../src/engine/worldgen'
import { serialiseGame } from '../../src/engine/save'
import { advanceOneWeek } from '../../src/engine/tick'
import { createFight, validateMatch } from '../../src/engine/fights'
import { agreeFight } from '../../src/engine/fightNegotiation'
import { addFight, createEvent, putOnSale } from '../../src/engine/events/events'
import { runEventToEnd } from '../../src/engine/commands'
import { ackGuideStep, syncGuide } from '../../src/engine/guide'
import type { GameState, Id } from '../../src/engine/types'

const out = process.argv[2] ?? '/tmp/e2e'
const SAT = 5
const mk = (seed: string): GameState => createNewGame({ seed, promotionName: 'Ironbridge Boxing', promoterName: 'Sam Reid', homeCountry: 'ENG', difficulty: 'standard', logo: { emblem: 'glove', color: '#e11d2a', monogram: 'IB' }, scenario: 'groundUp' }, 1)
const save = (n: string, s: GameState) => writeFileSync(`${out}/${n}.json`, serialiseGame(s))
const mine = (s: GameState) => new Set(Object.values(s.contracts).filter((c) => c.promotionId === s.playerPromotionId && c.status === 'active').map((c) => c.fighterId))

function agreeFights(s: GameState, n: number): Id[] {
  const my = mine(s); const used = new Set<Id>(); const ids: Id[] = []
  const pool = Object.values(s.fighters).filter((f) => f.status === 'active' && !f.injury && !f.activeFightId).sort((x, y) => Number(my.has(y.id)) - Number(my.has(x.id)) || (x.id < y.id ? -1 : 1))
  for (const x of pool) {
    if (ids.length >= n) break
    if (used.has(x.id)) continue
    const y = pool.find((o) => o.id !== x.id && !used.has(o.id) && validateMatch(s, x.id, o.id).ok); if (!y) continue
    used.add(x.id); used.add(y.id)
    const f = createFight(s, x.id, y.id, s.playerPromotionId, 'player'); agreeFight(s, f, { purseB: 4_000, winBonusB: 400, rematch: false, venuePref: 'neutral', fights: 1 }); ids.push(f.id)
  }
  return ids
}
let s = syncGuide(mk('p7-fx'))
save('p7-new', s)
// venue booked, a fight agreed, but the card is not built
const v = Object.values(s.venues).filter((x) => !x.legacy).sort((a, b) => a.capacity - b.capacity)[0]
let eventId = '' as Id
for (let wk = 6; wk < 14 && !eventId; wk++) { const r = createEvent(s, { name: 'Opening Night', day: s.today + SAT + wk * 7, venueId: v.id }); if (r.ok) { s = r.state; eventId = r.eventId! } }
s = ackGuideStep(syncGuide(s), 'position')
const ids = agreeFights(s, v.minFights); s = syncGuide(s)
save('p7-card', s)
for (const id of ids) s = addFight(s, eventId, id).state
s = syncGuide(s); save('p7-ready', s)
s = syncGuide(putOnSale(s, eventId).state)
for (let i = 0; i < 16 && !['fightWeek', 'live'].includes(s.events[eventId].status); i++) s = syncGuide(advanceOneWeek(s))
save('p7-night', s)
s = syncGuide(runEventToEnd(s, eventId).state)
save('p7-done', s)
// an established career: version 12, no guide record, a show on sale
let old = mk('p7-old'); old = syncGuide(old)
const raw = JSON.parse(serialiseGame(old)); raw.version = 12; delete raw.guide
writeFileSync(`${out}/p7-old.json`, JSON.stringify(raw))
writeFileSync(`${out}/p7-meta.json`, JSON.stringify({ eventId, minFights: v.minFights, venue: v.name, doneEvent: eventId }))
console.log('ok', eventId, v.name, v.minFights, ids.length)
