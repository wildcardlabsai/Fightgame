// Builds the saves the Phase 5.4 browser scripts load.
// Usage: npx tsx scripts/browser/make-phase54-fixtures.ts [outDir]
import { mkdirSync, writeFileSync } from 'node:fs'
import { advanceOneWeek } from '../../src/engine/tick'
import { createNewGame } from '../../src/engine/worldgen'
import { serialiseGame } from '../../src/engine/save'
import { newLog, playWeek, STRATEGIES } from '../../src/engine/sim/strategies'
import { qualifiesFor, titleKey, touchTitles } from '../../src/engine/media/titles'
import { getList } from '../../src/engine/media/records'
import { levelOf } from '../../src/engine/business/titleDefs'
import { createEvent, createEventInternal, venueBookedOn } from '../../src/engine/events/events'
import { venueViews } from '../../src/engine/eventViews'
import { startPursuit } from '../../src/engine/world/pursuit'

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
// A save where the board has ORDERED every world title challenge the player's fighters could ask for (mandatory challengers): a request cannot be
// turned down, so the championship browser test can always run a fight through the screens.
const o = structuredClone(s)
{
  // Hand the player the leading qualified contender of several world belts (taking over their own contracts), and have the board order each challenge.
  const media = o.media!
  const mineContracts = Object.values(o.contracts).filter((c) => c.promotionId === o.playerPromotionId && c.status === 'active')
  let used = 0
  const divisions = new Set<string>()
  for (const [key, rec] of Object.entries(media.titles)) {
    const [body, wc] = key.split('|')
    if (!rec.c || levelOf(body) !== 'world' || rec.mand || divisions.has(wc) || used >= mineContracts.length || used >= 6) continue
    const f = getList(media, body, wc as never)?.e.find((e) => e.r >= 1 && e.f !== rec.c && o.fighters[e.f].status === 'active' && !o.fighters[e.f].contractId && qualifiesFor(o, body, e.f))
    if (!f) continue
    const x = o.fighters[f.f], champ = o.fighters[rec.c]
    const c = mineContracts[used++]
    divisions.add(wc)
    o.fighters[c.fighterId].contractId = null
    c.fighterId = x.id; x.contractId = c.id
    for (const id of [x.id, champ.id]) { const q = o.fighters[id]; q.activeFightId = null; q.injury = null; q.suspendedUntil = null; q.lastFightDay = null }
    rec.mand = { challenger: x.id, cn: `${x.firstName} ${x.lastName}`, ordered: o.today, due: o.today + 26 * 7 }
  }
}
// The browser test also puts one title fight through an open show: make sure the promoter has one (the bot-played world may not).
const SAT = 5 // shows fall 5 days after today modulo a week (events.isSaturday)
let ordered = o
for (const v of Object.values(o.venues).sort((a, b) => a.capacity - b.capacity)) {
  let made = false
  for (let wk = 10; wk < 40 && !made; wk++) {
    const r = createEvent(ordered, { name: 'Fixture Night', day: o.today + SAT + wk * 7, venueId: v.id })
    if (r.ok) { ordered = r.state; made = true }
  }
  if (made) break
}
writeFileSync(`${out}/p54-ordered.json`, serialiseGame(ordered))
console.log('fixtures written to', out, 'mine', mine?.id, 'roster', Object.values(s.contracts).filter((c) => c.promotionId === s.playerPromotionId).length, 'events', Object.values(s.events).filter((e) => e.promotionId === s.playerPromotionId).length)

// Phase 5.4B: a world with a rival offer on a fighter the player is following, and a rival show on a date the player might pick.
{
  const w = structuredClone(s)
  const rival = Object.values(w.promotions).find((p) => !p.isPlayer && p.ai && !p.ai.fin.collapsing && p.tier !== 'Startup')!
  rival.cash = Math.max(rival.cash, 3_000_000)
  const ff = Object.values(w.fighters).filter((f) => f.status === 'active' && f.contractId === null && f.record.wins >= 5).sort((a, b) => b.reputation - a.reputation)[0]
  if (!w.knowledge[ff.id]) w.knowledge[ff.id] = { fighterId: ff.id, discoveredDay: w.today, source: 'tip', est: {}, insight: 0, reports: [], observations: 0 }
  if (!w.shortlist.includes(ff.id)) w.shortlist.push(ff.id)
  startPursuit(w, ff.id, rival.id, w.today + 14)
  const venues = venueViews(w)
  const v = venues.find((x) => !x.locked && x.tier === 'regional') ?? venues.find((x) => !x.locked)!
  const day = v.freeDates[0]
  const other = Object.values(w.venues).find((x) => x.country === v.country && x.id !== v.id && !x.legacy && !venueBookedOn(w, x.id, day))
  if (other) createEventInternal(w, rival.id, { name: 'Rival Night', day, venueId: other.id }, 'ai')
  writeFileSync(`${out}/p54b-world.json`, serialiseGame(w))
  console.log('p54b-world: offer on', ff.id, 'from', rival.name, '; rival show', other ? other.city : 'none', 'on', day)
}
