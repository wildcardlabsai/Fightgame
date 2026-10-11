/**
 * Phase 8 (beta readiness): regressions for defects found in the fresh-player walkthrough, and the persistence guarantees a beta tester relies on:
 * a reload never loses a decision, never repeats a settled result, a booking or a payment, and never changes what the simulation does next.
 */
import { describe, expect, it } from 'vitest'
import { createNewGame } from './worldgen'
import { deserialiseGame, serialiseGame } from './save'
import { advanceOneWeek } from './tick'
import { createFight, validateMatch } from './fights'
import { agreeFight } from './fightNegotiation'
import { addFight, createEvent, putOnSale } from './events/events'
import { runEventToEnd } from './commands'
import { suggestedVenue, venueViews } from './eventViews'
import { ackGuideStep, guideView, syncGuide } from './guide'
import { useGame } from '../store/gameStore'
import type { GameState, Id } from './types'

const SAT = 5
const fresh = (seed = 'p8', scenario: 'groundUp' | 'regional' = 'groundUp', country: 'ENG' | 'USA' = 'ENG'): GameState =>
  createNewGame({ seed, promotionName: 'Ironbridge Boxing', promoterName: 'Sam Reid', homeCountry: country, difficulty: 'standard', logo: { emblem: 'glove', color: '#e11d2a', monogram: 'IB' }, scenario }, 1)
const mine = (s: GameState) => new Set(Object.values(s.contracts).filter((c) => c.promotionId === s.playerPromotionId && c.status === 'active').map((c) => c.fighterId))

function agreeFights(s: GameState, n: number): Id[] {
  const my = mine(s); const used = new Set<Id>(); const out: Id[] = []
  const pool = Object.values(s.fighters).filter((f) => f.status === 'active' && !f.injury && !f.activeFightId).sort((x, y) => Number(my.has(y.id)) - Number(my.has(x.id)) || (x.id < y.id ? -1 : 1))
  for (const x of pool) {
    if (out.length >= n) break
    if (used.has(x.id)) continue
    const y = pool.find((o) => o.id !== x.id && !used.has(o.id) && validateMatch(s, x.id, o.id).ok); if (!y) continue
    used.add(x.id); used.add(y.id)
    const f = createFight(s, x.id, y.id, s.playerPromotionId, 'player'); agreeFight(s, f, { purseB: 4_000, winBonusB: 400, rematch: false, venuePref: 'neutral', fights: 1 }); out.push(f.id)
  }
  return out
}
function bookShow(s: GameState, venueId?: Id): { s: GameState; id: Id; min: number } {
  const v = venueId ? s.venues[venueId] : suggestedVenue(s)
  for (let wk = 6; wk < 14; wk++) { const r = createEvent(s, { name: 'Opening Night', day: s.today + SAT + wk * 7, venueId: v.id }); if (r.ok) return { s: r.state, id: r.eventId!, min: v.minFights } }
  throw new Error('no date')
}
function runShow(start: GameState): { s: GameState; id: Id } {
  let { s, id, min } = bookShow(start)
  for (const f of agreeFights(s, min)) s = addFight(s, id, f).state
  s = putOnSale(s, id).state
  for (let i = 0; i < 16 && !['fightWeek', 'live'].includes(s.events[id].status); i++) s = advanceOneWeek(s)
  const r = runEventToEnd(s, id); expect(r.ok).toBe(true)
  return { s: r.state, id }
}
const strip = (s: GameState) => { const j = JSON.parse(serialiseGame(s)); delete j.guide; return j }

describe('the new-show form starts on a sensible venue', () => {
  it('is the smallest open hall in the promotion’s own country, not a regional venue abroad', () => {
    for (const country of ['ENG', 'USA'] as const) {
      const s = fresh('p8-venue-' + country, 'groundUp', country)
      const v = suggestedVenue(s)
      expect(v.locked).toBeNull()
      expect(v.country).toBe(s.promotions[s.playerPromotionId].homeCountry)
      const home = venueViews(s).filter((x) => !x.locked && x.freeDates.length > 0 && x.country === v.country)
      expect(v.capacity).toBe(Math.min(...home.map((x) => x.capacity)))
    }
  })
  it('falls back to any open venue when none at home is free, and never to a locked one', () => {
    const s = fresh('p8-venue-fb')
    const views = venueViews(s).map((v) => (v.country === s.promotions[s.playerPromotionId].homeCountry ? { ...v, freeDates: [] } : v))
    const v = suggestedVenue(s, views)
    expect(v.locked).toBeNull(); expect(v.freeDates.length).toBeGreaterThan(0)
  })
})

describe('the guide does not claim a fight is missing when the card is already full of them', () => {
  it('no "agree a fight" blocker on the card step once the agreed fights are on the card', () => {
    let s = syncGuide(ackGuideStep(syncGuide(fresh('p8-guide')), 'position'))
    const b = bookShow(s); s = syncGuide(b.s)
    expect(guideView(s)!.steps.find((x) => x.id === 'card')!.blocker).toMatch(/agreed fight/) // genuinely nothing to add yet
    const ids = agreeFights(s, b.min); s = syncGuide(s)
    expect(guideView(s)!.steps.find((x) => x.id === 'card')!.blocker).toBeUndefined() // fights waiting: nothing to complain about
    for (const f of ids.slice(0, -1)) s = syncGuide(addFight(s, b.id, f).state)
    s = syncGuide(addFight(s, b.id, ids[ids.length - 1]).state)
    expect(guideView(s)!.steps.find((x) => x.id === 'card')!.blocker).toBeUndefined()
  })
})

describe('save → load never changes what happens next', () => {
  it('a reloaded career and the original stay identical week after week, through a whole show', () => {
    const { s: done } = runShow(fresh('p8-rt'))
    const reloaded = deserialiseGame(serialiseGame(done))!
    expect(strip(reloaded)).toEqual(strip(done))
    let a = done, b = reloaded
    for (let i = 0; i < 10; i++) { a = advanceOneWeek(a); b = advanceOneWeek(b) }
    expect(strip(b)).toEqual(strip(a))
  }, 120_000)
  it('reloading mid-show does not repeat the settlement: ledger, result and cash are unchanged', () => {
    const { s: done, id } = runShow(fresh('p8-settle'))
    const once = { n: done.ledger.length + done.ledgerArchive, cash: done.promotions[done.playerPromotionId].cash, profit: done.events[id].result!.profit }
    let s = deserialiseGame(serialiseGame(done))!
    s = deserialiseGame(serialiseGame(s))! // twice, as a user reloading repeatedly would
    expect(s.events[id].result!.profit).toBe(once.profit)
    expect(s.events[id].settled).toBe(true)
    // the settled show's revenue/costs are in the ledger exactly once
    const settledLines = (st: GameState) => st.ledger.filter((l) => /Opening Night/.test(l.description) && ['tickets', 'venue', 'production', 'officials', 'security'].includes(l.category)).length
    const base = settledLines(done)
    for (let i = 0; i < 8; i++) s = advanceOneWeek(s)
    expect(settledLines(s)).toBe(base)
    expect(s.promotions[s.playerPromotionId].cash).toBeLessThan(once.cash + 1) // only the weekly bills have moved it
  }, 120_000)
  it('a v12 save taken mid-career migrates and then simulates exactly like the same career saved as v13', () => {
    const base = fresh('p8-mig'); let s = base
    for (let i = 0; i < 6; i++) s = advanceOneWeek(s)
    const raw = JSON.parse(serialiseGame(s)); raw.version = 12; delete raw.guide
    const migrated = deserialiseGame(JSON.stringify(raw))!
    expect(migrated.version).toBe(13); expect(migrated.guide!.active).toBe(false)
    let a = s, b = migrated
    for (let i = 0; i < 8; i++) { a = advanceOneWeek(a); b = advanceOneWeek(b) }
    expect(strip(b)).toEqual(strip(a))
  }, 120_000)
  it('an accepted external booking survives save/load once and completes once', () => {
    let s = fresh('p8-ext')
    const rival = Object.values(s.promotions).find((p) => !p.isPlayer && p.ai)!
    const me = [...mine(s)][0]
    const opp = Object.values(s.fighters).find((f) => f.status === 'active' && !f.activeFightId && !f.injury && f.id !== me && !mine(s).has(f.id) && validateMatch(s, me, f.id).ok)!
    const f = createFight(s, me, opp.id, rival.id, 'ai'); agreeFight(s, f, { purseB: 3_000, winBonusB: 300, rematch: false, venuePref: 'neutral', fights: 1 })
    const count = (st: GameState) => Object.values(st.fights).filter((x) => x.sideA.fighterId === me || x.sideB.fighterId === me).length
    const before = count(s)
    s = deserialiseGame(serialiseGame(s))!; s = deserialiseGame(serialiseGame(s))!
    expect(count(s)).toBe(before)
    expect(s.fighters[me].activeFightId).toBe(f.id)
  })
})

describe('autosave covers decisions, not only the passing of time', () => {
  it('booking a show (no time advanced) is written to the autosave slot', async () => {
    const g = useGame.getState()
    g.startNewGame({ seed: 'p8-auto', promotionName: 'Autosave Boxing', promoterName: 'Sam Reid', homeCountry: 'ENG', difficulty: 'standard', logo: { emblem: 'glove', color: '#e11d2a', monogram: 'AB' }, scenario: 'groundUp' })
    const game = useGame.getState().game!
    const v = suggestedVenue(game)
    const id = useGame.getState().createEvent({ name: 'Autosaved Night', day: game.today + SAT + 7 * 6, venueId: v.id })
    expect(id).not.toBeNull()
    await new Promise((r) => setTimeout(r, 1700))
    await useGame.getState().refreshSaves()
    const auto = useGame.getState().saves.find((m) => m.slot === 'auto' && m.promotionName === 'Autosave Boxing')
    expect(auto, 'an autosave slot exists').toBeDefined()
    expect(await useGame.getState().loadSaved(auto!.id)).toBe(true)
    expect(Object.values(useGame.getState().game!.events).some((e) => e.name === 'Autosaved Night')).toBe(true)
  }, 20_000)
})

describe('recovery from bad or incomplete data', () => {
  it('garbage, truncated and wrong-shaped saves are refused cleanly (null), never half-loaded', () => {
    const good = serialiseGame(fresh('p8-bad'))
    for (const raw of ['', 'not json', '{', good.slice(0, good.length >> 1), '[]', 'null', '{"version":13}', '{"version":13,"promotions":{},"fighters":null}']) expect(deserialiseGame(raw), JSON.stringify(raw.slice(0, 30))).toBeNull()
  })
  it('a save from a newer build is refused rather than downgraded', () => {
    const raw = JSON.parse(serialiseGame(fresh('p8-new'))); raw.version = 99
    expect(deserialiseGame(JSON.stringify(raw))).toBeNull()
  })
  it('an old save missing whole later-phase records is rebuilt to the current shape and keeps playing', () => {
    const s = fresh('p8-old'); const raw = JSON.parse(serialiseGame(s))
    raw.version = 9; for (const k of ['world', 'office', 'bridge', 'guide', 'business']) delete raw[k]
    const m = deserialiseGame(JSON.stringify(raw))!
    expect(m).not.toBeNull(); expect(m.version).toBe(13); expect(m.guide!.active).toBe(false); expect(m.office).toBeDefined(); expect(m.world).toBeDefined()
    let t = m; for (let i = 0; i < 6; i++) t = advanceOneWeek(t)
    expect(t.today).toBe(m.today + 42)
  }, 60_000)
  it('importing a bad file through the app leaves the current career untouched', () => {
    const g = useGame.getState()
    g.startNewGame({ seed: 'p8-imp', promotionName: 'Import Test', promoterName: 'Sam Reid', homeCountry: 'ENG', difficulty: 'standard', logo: { emblem: 'glove', color: '#e11d2a', monogram: 'IT' }, scenario: 'groundUp' })
    const before = useGame.getState().game
    expect(useGame.getState().importGame('{"definitely":"not a save"}')).toBe(false)
    expect(useGame.getState().game).toBe(before)
  })
})

describe('what a first-time player is offered by default', () => {
  it('the preselected career is not the Hard one, and every career is still selectable', async () => {
    const { DEFAULT_SCENARIO, SCENARIOS, SCENARIO_ORDER } = await import('./scenarios')
    expect(['Hard', 'Expert']).not.toContain(SCENARIOS[DEFAULT_SCENARIO].difficultyLabel)
    expect(SCENARIO_ORDER).toHaveLength(4)
    for (const id of SCENARIO_ORDER) expect(SCENARIOS[id]).toBeDefined()
  })
})
