// Phase 6.4 fixtures: a player show in fight week with a European title fight on it (champion = the player's), plus a rival show carrying the player's fighter.
// Usage: npx tsx scripts/browser/make-phase64-fixtures.ts [outDir]   (needs p54-champion.json in outDir, written by make-phase54-fixtures.ts)
import { readFileSync, writeFileSync } from 'node:fs'
import { advanceOneWeek } from '../../src/engine/tick'
import { deserialiseGame, serialiseGame } from '../../src/engine/save'
import { createFight, validateMatch } from '../../src/engine/fights'
import { agreeFight } from '../../src/engine/fightNegotiation'
import { addFight, createEvent } from '../../src/engine/events/events'
import { runNextEventFight } from '../../src/engine/commands'
import { stakesBetween } from '../../src/engine/business/stakes'
import type { GameState, Id } from '../../src/engine/types'

const out = process.argv[2] ?? '/tmp/e2e'
const base = deserialiseGame(readFileSync(`${out}/p54-champion.json`, 'utf8'))!
const SAT = 5
const mineIds = (s: GameState) => Object.values(s.contracts).filter((c) => c.promotionId === s.playerPromotionId && c.status === 'active').map((c) => c.fighterId)
const champId = mineIds(base).find((id) => Object.entries(base.media!.titles).some(([k, t]) => t.c === id && k.startsWith('european|')))!
const free = (s: GameState, f: Id, ex: Set<Id>) => { const x = s.fighters[f]; return x.status === 'active' && !x.activeFightId && !x.injury && !ex.has(f) }

function build(variant: number): { s: GameState; titleFight: Id; eventId: Id } | null {
  let s = structuredClone(base)
  s.seed = `${base.seed}-p64-${variant}`
  // any belt-holder / eligible challenger pair in the world (preferring the player's fighters on either side): the player is the organiser
  const pairs: { c: Id; ch: Id }[] = []
  for (const [k, t] of Object.entries(s.media!.titles)) {
    if (!t.c) continue
    const champ0 = s.fighters[t.c]; if (!champ0 || !free(s, t.c, new Set())) continue
    for (const f of Object.values(s.fighters)) {
      if (f.id === t.c || f.weightClass !== champ0.weightClass || !free(s, f.id, new Set()) || !validateMatch(s, t.c, f.id).ok) continue
      if (stakesBetween(s, t.c, f.id, champ0.weightClass).kind !== 'title') continue
      pairs.push({ c: t.c, ch: f.id })
    }
    void k
  }
  const mine = new Set(mineIds(s))
  pairs.sort((x, y) => Number(mine.has(y.c) || mine.has(y.ch)) - Number(mine.has(x.c) || mine.has(x.ch)) || (x.c + x.ch < y.c + y.ch ? -1 : 1))
  const pair = pairs[variant % Math.max(1, Math.min(pairs.length, 6))]
  if (!pair) { console.log('v', variant, 'no title pair'); return null }
  const used = new Set<Id>([pair.c, pair.ch])
  const cands = [s.fighters[pair.ch]]
  const champ = s.fighters[pair.c]
  void champ
  const venue = Object.values(s.venues).filter((v) => !v.legacy && v.minFights <= 3 && v.maxFights >= 4).sort((a, b) => a.capacity - b.capacity)[0]
  if (!venue || !cands.length) { console.log('v', variant, 'no venue/cands', !!venue, cands.length); return null }
  let eventId: Id | null = null
  for (let wk = 3; wk < 12 && !eventId; wk++) { const r = createEvent(s, { name: 'Title Night', day: s.today + SAT + wk * 7, venueId: venue.id }); if (r.ok) { s = r.state; eventId = r.eventId! } }
  if (!eventId) { console.log('v', variant, 'no event slot'); return null }
  const book = (a: Id, b: Id, purse: number): Id | null => {
    const f = createFight(s, a, b, s.playerPromotionId, 'player')
    agreeFight(s, f, { purseB: purse, winBonusB: Math.round(purse / 10), rematch: false, venuePref: 'neutral', fights: 1 })
    const r = addFight(s, eventId!, f.id)
    if (!r.ok) return null
    s = r.state
    return f.id
  }
  let titleFight: Id | null = null
  for (const c of cands.slice(0, 12)) {
    const id = book(pair.c, c.id, 40_000)
    if (id && s.media!.titleFights[id]) { titleFight = id; used.add(c.id); break }
    if (id) console.log('v', variant, 'candidate', c.id, 'booked but not a title fight (rep', c.reputation, ')')
  }
  if (!titleFight) { console.log('v', variant, 'no title challenger'); return null }
  // two undercard bouts from the free pool
  const pool = Object.values(s.fighters).filter((f) => f.status === 'active' && free(s, f.id, used)).sort((a, b) => (a.id < b.id ? -1 : 1))
  for (const wc of new Set(pool.map((f) => f.weightClass))) {
    const g = pool.filter((f) => f.weightClass === wc && free(s, f.id, used))
    for (let i = 0; i + 1 < g.length && s.events[eventId].card.length < 3; i += 2) {
      if (!validateMatch(s, g[i].id, g[i + 1].id).ok) continue
      const id = book(g[i].id, g[i + 1].id, 4_000); if (id) { used.add(g[i].id); used.add(g[i + 1].id) }
    }
    if (s.events[eventId].card.length >= 3) break
  }
  if (s.events[eventId].card.length < 3) { console.log('v', variant, 'card too small', s.events[eventId].card.length); return null }
  for (let i = 0; i < 20 && s.events[eventId].status !== 'fightWeek'; i++) s = advanceOneWeek(s)
  if (s.events[eventId].status !== 'fightWeek') { console.log('v', variant, 'status', s.events[eventId].status); return null }
  if (s.fights[titleFight].status === 'cancelled') { console.log('v', variant, 'title fight cancelled'); return null }
  return { s, titleFight, eventId }
}

let made: ReturnType<typeof build> = null
for (let v = 0; v < 12 && !made; v++) made = build(v)
if (!made) throw new Error('could not build a title night')
const { s, titleFight, eventId } = made
// the title fight must be on the card, and the main event
const ev = s.events[eventId]
console.log('title night', eventId, 'card', ev.card.length, 'title fight last?', ev.card[ev.card.length - 1] === titleFight, JSON.stringify(s.media!.titleFights[titleFight]))
writeFileSync(`${out}/p64-title.json`, serialiseGame(s))
// the same night, run to the end deterministically in order, for the "completed" screens
let done = s
for (let i = 0; i < 6 && done.events[eventId].status !== 'completed' && done.events[eventId].status !== 'settled'; i++) { const r = runNextEventFight(done, eventId); if (!r.ok) break; done = r.state }
writeFileSync(`${out}/p64-meta.json`, JSON.stringify({ eventId, titleFight, results: ev.card.map((id) => ({ id, method: done.fights[id].result?.method, round: done.fights[id].result?.round })) }, null, 1))
console.log(readFileSync(`${out}/p64-meta.json`, 'utf8'))
