// Builds the saves the Phase 5.4 browser scripts load.
// Usage: npx tsx scripts/browser/make-phase54-fixtures.ts [outDir]
import { mkdirSync, writeFileSync } from 'node:fs'
import { advanceOneWeek } from '../../src/engine/tick'
import { createNewGame } from '../../src/engine/worldgen'
import { serialiseGame } from '../../src/engine/save'
import { newLog, playWeek, STRATEGIES } from '../../src/engine/sim/strategies'
import { qualifiesFor, titleKey, touchTitles } from '../../src/engine/media/titles'
import { getList } from '../../src/engine/media/records'
import { reseatLists } from '../../src/engine/media/rankings'
import { levelOf } from '../../src/engine/business/titleDefs'
import { cancelEventCommand, createEvent, createEventInternal, venueBookedOn } from '../../src/engine/events/events'
import { venueViews } from '../../src/engine/eventViews'
import { startPursuit } from '../../src/engine/world/pursuit'
import { post } from '../../src/engine/ledger'
import { officeOf } from '../../src/engine/office/state'
import { offerProblem } from '../../src/engine/office/offers'
import { createFight } from '../../src/engine/fights'
import { setGoal } from '../../src/engine/office/goals'

const out = process.argv[2] ?? '/tmp/e2e'
mkdirSync(out, { recursive: true })
const logo = { monogram: 'P', color: '#d4a24c', emblem: 'bolt' as const }
const make = (seed: string, scenario?: 'regional') => createNewGame({ seed, promotionName: 'Phase Fifty-Four Promotions', promoterName: 'Tester', homeCountry: 'ENG', difficulty: 'standard', logo, scenario }, 1_700_000_000_000)

writeFileSync(`${out}/p54-new.json`, serialiseGame(make('p54-new')))
let s = make(process.env.P54_SEED ?? 'p54-played', 'regional')
const log = newLog()
for (let w = 1; w <= 100; w++) {
  s = playWeek(s, STRATEGIES.balanced, log)
  s = advanceOneWeek(s)
  if (w === 100) {
    // The venue tests need a show that is still being built (venue booked, no card yet); a bot-played week may not leave one, so make sure of it.
    let played = s
    if (!Object.values(played.events).some((e) => e.promotionId === played.playerPromotionId && ['venueBooked', 'cardBuilding'].includes(e.status))) {
      outer: for (const v of Object.values(played.venues).filter((x) => !x.legacy).sort((a, b) => a.capacity - b.capacity)) {
        for (let wk = 8; wk < 40; wk++) {
          const r = createEvent(played, { name: 'Venue Test Night', day: played.today + 5 + wk * 7, venueId: v.id })
          if (r.ok) { played = r.state; break outer }
        }
      }
    }
    writeFileSync(`${out}/p54-played.json`, serialiseGame(played))
  }
}
// A save where the player's best fighter holds a European belt and has an open promise: the champion-side screens need something to show.
const g = structuredClone(s)
const mine = Object.values(g.contracts).filter((c) => c.promotionId === g.playerPromotionId).map((c) => g.fighters[c.fighterId]).sort((a, b) => b.reputation - a.reputation)[0]
if (mine && g.media) {
  const body = 'european'
  const k = titleKey(body, mine.weightClass)
  g.media.titles[k] = { c: mine.id, cn: `${mine.firstName} ${mine.lastName}`, since: g.today - 20 * 7, defences: 1, lastFight: g.today - 6 * 7 }
  touchTitles(g.media)
  reseatLists(g, g.media, [mine.weightClass]) // the published lists must show the champion first, as they would after the next pass
}
writeFileSync(`${out}/p54-champion.json`, serialiseGame(g))
// A save where the board has ORDERED every world title challenge the player's fighters could ask for (mandatory challengers): a request cannot be
// turned down, so the championship browser test can always run a fight through the screens.
// the browser test advances week by week: do not hand it a world stopped on one of the player's own fight nights
let sOrd = s
for (let i = 0; i < 8 && Object.values(sOrd.fights).some((f) => f.status === 'fightNight' && (f.organiserId === sOrd.playerPromotionId || f.sideA.promotionId === sOrd.playerPromotionId || f.sideB.promotionId === sOrd.playerPromotionId)); i++) sOrd = advanceOneWeek(playWeek(sOrd, STRATEGIES.balanced, log))
const o = structuredClone(sOrd)
{
  // Hand the player the leading qualified contender of several world belts (taking over their own contracts), and have the board order each challenge.
  const media = o.media!
  const mineContracts = Object.values(o.contracts).filter((c) => c.promotionId === o.playerPromotionId && c.status === 'active')
  let used = 0
  const divisions = new Set<string>()
  for (const [key, rec] of Object.entries(media.titles)) {
    const [body, wc] = key.split('|')
    if (!rec.c || levelOf(body) !== 'world' || rec.mand || divisions.has(wc) || used >= mineContracts.length || used >= 6) continue
    const f = getList(media, body, wc as never)?.e.find((e) => e.r >= 1 && e.r <= 6 && e.f !== rec.c && o.fighters[e.f].status === 'active' && !o.fighters[e.f].activeFightId && qualifiesFor(o, body, e.f))
    if (!f) continue
    const x = o.fighters[f.f], champ = o.fighters[rec.c]
    const c = mineContracts[used++]
    divisions.add(wc)
    o.fighters[c.fighterId].contractId = null
    // credible contenders are scarce and usually signed elsewhere: release their contract so the player can take them over
    if (x.contractId && o.contracts[x.contractId]) { o.contracts[x.contractId].status = 'released'; x.contractId = null }
    c.fighterId = x.id; x.contractId = c.id
    for (const id of [x.id, champ.id]) { const q = o.fighters[id]; q.activeFightId = null; q.injury = null; q.suspendedUntil = null; q.lastFightDay = null }
    rec.mand = { challenger: x.id, cn: `${x.firstName} ${x.lastName}`, ordered: o.today, due: o.today + 26 * 7 }
  }
}
// The browser test also puts one title fight through an open show: make sure the promoter has one (the bot-played world may not).
const SAT = 5 // shows fall 5 days after today modulo a week (events.isSaturday)
let ordered = o
// ...and clear the player's own imminent shows so a fight night does not block the week-by-week advance in that test
for (const e of Object.values(ordered.events)) {
  if (e.promotionId === ordered.playerPromotionId && e.day < ordered.today + 8 * 7 && e.status !== 'settled' && e.status !== 'cancelled') { const r = cancelEventCommand(ordered, e.id); if (r.ok) ordered = r.state }
}
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

// Phase 5.4C: a played world with two live rival offers (one on the player's show, one on a rival's show), a career objective and a show with a card.
for (const seedName of ['p54c-passive', 'p54c-b', 'p54c-c', 'p54c-d', 'p54c-e', 'p54c-f', 'p54c-g', 'p54c-h']) {
  let w = make(seedName)
  for (let i = 0; i < 80; i++) w = advanceOneWeek(w)
  w.promotions[w.playerPromotionId].cash = Math.max(w.promotions[w.playerPromotionId].cash, 1_500_000)
  const o = officeOf(w)
  o.offers = {}
  const rivals = Object.values(w.promotions).filter((p) => !p.isPlayer && p.ai && p.tier !== 'Startup')
  const roster = Object.values(w.contracts).filter((c) => c.promotionId === w.playerPromotionId && c.status === 'active').map((c) => w.fighters[c.fighterId]).filter((f) => f && f.status === 'active' && !f.activeFightId && !f.injury)
  const free = (f: typeof roster[number], skip: Set<string>) => { const out: { p: typeof rivals[number]; f: (typeof roster)[number] }[] = []; for (const p of rivals) { const x = Object.values(w.contracts).filter((c) => c.promotionId === p.id && c.status === 'active').map((c) => w.fighters[c.fighterId]).filter((y) => y && y.status === 'active' && !y.activeFightId && !y.injury && y.weightClass === f.weightClass && !skip.has(y.id) && (y.lastFightDay === null || w.today - y.lastFightDay > 60)); for (const y of x) { if (!skip.has(y.id)) out.push({ p, f: y }) } } return out }
  const mk = (n: number, host: 'you' | 'them', promoId: string, theirs: string, mine: string, eventId: string | null) => {
    const terms = { purse: host === 'you' ? 6000 : 9000, winBonus: 600, rematch: false }
    o.offers[`of_f${n}`] = { id: `of_f${n}`, promoId, mine, theirs, reason: 'competitive', host, eventId, day: eventId ? w.events[eventId].day : null, rounds: 8, stakes: 'standard', terms, status: 'open', createdDay: w.today, expiresDay: w.today + 28, fightId: null, history: [{ day: w.today, by: 'rival', terms, note: 'Opening proposal' }], message: 'We think this is a good fight for both fighters.' }
  }
  for (const c of Object.values(w.contracts)) if (c.status === 'active' && c.endDay < w.today + 400) c.endDay = w.today + 700
  const used = new Set<string>(); const usedMine = new Set<string>()
  youLoop: for (const f of roster) for (const t of free(f, used)) { mk(1, 'you', t.p.id, t.f.id, f.id, null); if (offerProblem(w, o.offers.of_f1)) { if (process.env.DBG) console.log('f1', offerProblem(w, o.offers.of_f1)); delete o.offers.of_f1; continue } used.add(t.f.id); usedMine.add(f.id); break youLoop }
  themLoop: for (const f of roster) {
    if (usedMine.has(f.id)) continue
    for (const t of free(f, used)) {
      const venue = Object.values(w.venues).find((v) => !v.legacy && v.maxFights >= 5)!
      const day = w.today + 56 + ((5 - ((w.today + 56 - w.today) % 7)) + 7) % 7
      const ev = createEventInternal(w, t.p.id, { name: 'Rival Test Night', day, venueId: venue.id }, 'ai')
      t.p.cash = Math.max(t.p.cash, 5_000_000)
      mk(2, 'them', t.p.id, t.f.id, f.id, ev.id)
      if (offerProblem(w, o.offers.of_f2)) { if (process.env.DBG) console.log('f2', offerProblem(w, o.offers.of_f2)); delete o.offers.of_f2; continue }
      break themLoop
    }
  }
  if (process.env.DBG) console.log('roster', roster.length, 'rivals', rivals.length, 'offers', Object.keys(o.offers))
  const star = roster[roster.length - 1]
  if (star) setGoal(w, star.id, 'regional')
  {
    const venue = Object.values(w.venues).find((v) => !v.legacy && v.tier === 'regional')!
    const made = createEvent(w, { name: 'Angle Night', day: w.today + 70 + ((5 - (70 % 7) + 7) % 7), venueId: venue.id })
    if (made.ok) {
      Object.assign(w, made.state)
      const evv = w.events[made.eventId!]
      const a = roster.find((f) => !usedMine.has(f.id) && f.id !== star?.id && !w.fighters[f.id].activeFightId)
      const b = a && Object.values(w.fighters).find((x) => x.status === 'active' && x.id !== a.id && !x.activeFightId && !x.injury && x.weightClass === a.weightClass && x.id !== star?.id && !used.has(x.id))
      if (a && b) { const fi = createFight(w, a.id, b.id, w.playerPromotionId, 'player') as { id: string; status: string; eventId?: string | null }; fi.status = 'agreed'; evv.card.push(fi.id); fi.eventId = evv.id }
    }
  }
  const ev = Object.values(w.events).find((e) => e.promotionId === w.playerPromotionId && e.status === 'scheduled')
  if (!(o.offers.of_f1 && o.offers.of_f2)) continue // a world that cannot show both kinds of offer is not a useful fixture: try the next seed
  writeFileSync(`${out}/p54c-office.json`, serialiseGame(w))
  console.log('p54c-office: offers', Object.keys(o.offers).join(','), 'objective on', star?.id, 'event', ev?.id)
  break
}

// Phase 5.4D: a played-out result and the decisions it opens: a breakout win (open decision), plus a setback decision on another fighter.
{
  let w = make('p54d-passive')
  for (let i = 0; i < 104; i++) w = advanceOneWeek(w)
  w.promotions[w.playerPromotionId].cash = Math.max(w.promotions[w.playerPromotionId].cash, 1_500_000)
  const o = officeOf(w)
  const roster = Object.values(w.contracts).filter((c) => c.promotionId === w.playerPromotionId && c.status === 'active').map((c) => w.fighters[c.fighterId]).filter((f) => f && f.status === 'active')
  const opp = (f: (typeof roster)[number]) => Object.values(w.fighters).find((x) => x.status === 'active' && x.id !== f.id && x.weightClass === f.weightClass && x.contractId && !w.contracts[x.contractId].promotionId.startsWith(w.playerPromotionId))!
  o.reviews = {}
  const [a, b] = roster
  o.reviews.rv_f1 = { id: 'rv_f1', kind: 'breakout', fighterId: a.id, oppId: opp(a).id, fightId: 'none', createdDay: w.today, expiresDay: w.today + 42, status: 'open' }
  o.reviews.rv_f2 = { id: 'rv_f2', kind: 'setback', fighterId: b.id, oppId: opp(b).id, fightId: 'none', createdDay: w.today, expiresDay: w.today + 42, status: 'open' }
  writeFileSync(`${out}/p54d-reviews.json`, serialiseGame(w))
  console.log('p54d-reviews: decisions on', a.id, b.id)
}

// Phase 5.6: a promotion that has run out of road (overdrawn, no show on the books) and the same save with no fighters.
{
  const d = structuredClone(s)
  for (const e of Object.values(d.events)) if (e.promotionId === d.playerPromotionId && !['settled', 'archived', 'cancelled'].includes(e.status)) e.status = 'cancelled'
  post(d, 'other', -90_000 - d.promotions[d.playerPromotionId].cash, 'Fixture: overdrawn')
  writeFileSync(`${out}/p56-distress.json`, serialiseGame(d))
  console.log('p56-distress: cash', d.promotions[d.playerPromotionId].cash)
}

// Phase 5.8: a played promotion with one fighter whose contract is about to run out, so a renewal conversation opens.
{
  const r = structuredClone(s)
  const c = Object.values(r.contracts).filter((x) => x.promotionId === r.playerPromotionId && x.status === 'active')[0]
  if (c) c.endDay = r.today + 12 * 7
  writeFileSync(`${out}/p58-renewal.json`, serialiseGame(r))
  console.log('p58-renewal: contract of', c?.fighterId, 'ends in 12 weeks')
}
