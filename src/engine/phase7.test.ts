/**
 * Phase 7: the guided first career. Milestones come from authoritative state, progress is saved with the career, an established career is never
 * shown the guide it did not ask for, and the guide can neither help nor hinder the simulation.
 */
import { describe, expect, it } from 'vitest'
import { createNewGame } from './worldgen'
import { deserialiseGame, serialiseGame } from './save'
import { advanceOneWeek } from './tick'
import { createFight, validateMatch } from './fights'
import { agreeFight } from './fightNegotiation'
import { addFight, createEvent, putOnSale } from './events/events'
import { runEventToEnd } from './commands'
import { ackGuideStep, dismissGuide, guideView, skipGuideStep, startGuide, syncGuide, type GuideStepId } from './guide'
import { HELP } from './glossary'
import { GAME_STATE_VERSION, type GameState, type Id } from './types'

const SAT = 5
const fresh = (seed = 'p7', scenario: 'groundUp' | 'regional' = 'groundUp'): GameState =>
  createNewGame({ seed, promotionName: 'Ironbridge Boxing', promoterName: 'Sam Reid', homeCountry: 'ENG', difficulty: 'standard', logo: { emblem: 'glove', color: '#e11d2a', monogram: 'IB' }, scenario }, 1)
const mine = (s: GameState) => Object.values(s.contracts).filter((c) => c.promotionId === s.playerPromotionId && c.status === 'active').map((c) => c.fighterId)
const doneIds = (s: GameState) => guideView(s)!.steps.filter((x) => x.done).map((x) => x.id)
const cur = (s: GameState) => guideView(s)?.current?.id

/** Agree one fight between two free fighters, preferring the player's own as side A. Returns the fight id. */
function agree(s: GameState, a: Id, b: Id, purse = 4_000): Id {
  const f = createFight(s, a, b, s.playerPromotionId, 'player')
  agreeFight(s, f, { purseB: purse, winBonusB: Math.round(purse / 10), rematch: false, venuePref: 'neutral', fights: 1 })
  return f.id
}
const freeFighter = (s: GameState, used: Set<Id>, pred: (id: Id) => boolean = () => true) => Object.values(s.fighters).filter((f) => f.status === 'active' && !f.injury && !f.activeFightId && !used.has(f.id) && pred(f.id)).sort((x, y) => (x.id < y.id ? -1 : 1))

/** Book `n` fights between free fighters of one division (the player's own first where they fit). Mutates and returns state. */
function agreeFights(s: GameState, n: number): Id[] {
  const used = new Set<Id>(); const out: Id[] = []
  const pool = freeFighter(s, used)
  const myIds = new Set(mine(s))
  pool.sort((x, y) => Number(myIds.has(y.id)) - Number(myIds.has(x.id)) || (x.id < y.id ? -1 : 1))
  for (const x of pool) {
    if (out.length >= n) break
    if (used.has(x.id)) continue
    const y = pool.find((o) => o.id !== x.id && !used.has(o.id) && validateMatch(s, x.id, o.id).ok)
    if (!y) continue
    used.add(x.id); used.add(y.id); out.push(agree(s, x.id, y.id))
  }
  return out
}

function smallVenueEvent(s: GameState): { s: GameState; id: Id; min: number } {
  const venues = Object.values(s.venues).filter((v) => !v.legacy).sort((a, b) => a.capacity - b.capacity)
  for (const v of venues) for (let wk = 6; wk < 14; wk++) {
    const r = createEvent(s, { name: 'Opening Night', day: s.today + SAT + wk * 7, venueId: v.id })
    if (r.ok) return { s: r.state, id: r.eventId!, min: v.minFights }
  }
  throw new Error('no venue')
}

/** Play a whole first show for the player the way a careful promoter would. Every state change goes through syncGuide, as the store does. */
function firstShow(start: GameState): { s: GameState; eventId: Id } {
  let s = syncGuide(start)
  const ev = smallVenueEvent(s); s = syncGuide(ev.s)
  const ids = agreeFights(s, ev.min); s = syncGuide(s)
  for (const id of ids) { const r = addFight(s, ev.id, id); expect(r.ok, 'addFight').toBe(true); s = syncGuide(r.state) }
  const sale = putOnSale(s, ev.id); expect(sale.ok, 'putOnSale').toBe(true); s = syncGuide(sale.state)
  for (let i = 0; i < 16 && !['fightWeek', 'live'].includes(s.events[ev.id].status); i++) s = syncGuide(advanceOneWeek(s))
  const run = runEventToEnd(s, ev.id); expect(run.ok, 'run').toBe(true); s = syncGuide(run.state)
  return { s, eventId: ev.id }
}

describe('activation', () => {
  it('a brand-new career starts with the guide on, at the first step, with nothing completed', () => {
    const s = syncGuide(fresh())
    expect(s.guide?.active).toBe(true)
    expect(s.guide!.rosterAtStart.length).toBe(4)
    const v = guideView(s)!
    expect(v.current!.id).toBe('position')
    expect(v.progress).toEqual({ done: 0, total: 8 })
    expect(v.steps.filter((x) => x.done)).toEqual([])
    expect(v.steps.filter((x) => x.optional).map((x) => x.id)).toEqual(['scout', 'sign'])
  })
  it('opening a screen, advancing time or reading the inbox completes nothing', () => {
    let s = syncGuide(fresh())
    for (let i = 0; i < 4; i++) s = syncGuide(advanceOneWeek(s))
    expect(doneIds(s)).toEqual([])
    expect(cur(s)).toBe('position')
  })
  it('every step names a real action and no step text mentions hidden attributes', () => {
    const v = guideView(syncGuide(fresh()))!
    for (const st of v.steps) {
      expect(st.go.label.length, st.id).toBeGreaterThan(3)
      expect(`${st.why} ${st.how}`).not.toMatch(/potential|hidden|discipline|composure|injury risk|personality/i)
    }
  })
})

describe('milestones are completed by real outcomes', () => {
  it('acknowledgements cannot be given ahead of the work', () => {
    const s = syncGuide(fresh())
    expect(ackGuideStep(s, 'review')).toBe(s)
    expect(ackGuideStep(s, 'next')).toBe(s)
    expect(ackGuideStep(s, 'matchup' as GuideStepId)).toBe(s) // not an acknowledgement step
  })
  it('walks the whole first show, in the order the game really works', () => {
    let s = syncGuide(fresh())
    s = ackGuideStep(s, 'position'); expect(cur(s)).toBe('matchup')
    const ev = smallVenueEvent(s); s = syncGuide(ev.s)
    expect(doneIds(s)).toEqual(['position', 'venue']) // booking a venue is a real outcome, even before the fight
    expect(cur(s)).toBe('matchup')
    const ids = agreeFights(s, ev.min); s = syncGuide(s)
    expect(doneIds(s)).toContain('matchup'); expect(cur(s)).toBe('card')
    for (const id of ids.slice(0, -1)) { s = syncGuide(addFight(s, ev.id, id).state) }
    expect(doneIds(s)).not.toContain('card') // one fight short of the venue's minimum
    s = syncGuide(addFight(s, ev.id, ids[ids.length - 1]).state)
    expect(doneIds(s)).toContain('card'); expect(cur(s)).toBe('sale')
    s = syncGuide(putOnSale(s, ev.id).state)
    expect(doneIds(s)).toContain('sale'); expect(cur(s)).toBe('show')
    for (let i = 0; i < 16 && !['fightWeek', 'live'].includes(s.events[ev.id].status); i++) s = syncGuide(advanceOneWeek(s))
    expect(doneIds(s)).not.toContain('show') // the card is on, the night has not been run
    s = syncGuide(runEventToEnd(s, ev.id).state)
    expect(doneIds(s)).toContain('show'); expect(cur(s)).toBe('review')
    const facts = guideView(s)!.current!.facts!
    expect(facts.join(' ')).toMatch(/Attendance/)
    s = ackGuideStep(s, 'review'); expect(cur(s)).toBe('next')
    s = ackGuideStep(s, 'next')
    expect(s.guide!.active).toBe(false); expect(s.guide!.finished).toBeDefined(); expect(guideView(s)).toBeNull()
  })
  it('a blocked action says why instead of sending the player to a dead end', () => {
    const s = fresh()
    for (const id of mine(s)) s.fighters[id].activeFightId = 'busy'
    const v = guideView(syncGuide(ackGuideStep(syncGuide(s), 'position')))!
    expect(v.current!.id).toBe('matchup')
    expect(v.current!.blocker).toMatch(/fit and free/)
    const poor = fresh(); poor.promotions[poor.playerPromotionId].cash = -1
    const g = guideView(syncGuide(poor))!.steps.find((x) => x.id === 'venue')!
    expect(g.blocker).toMatch(/overdrawn/)
  })
})

describe('other valid strategies', () => {
  it('booking the venue first is fine: the fight step stays current and the card step explains what is missing', () => {
    let s = syncGuide(ackGuideStep(syncGuide(fresh()), 'position'))
    s = syncGuide(smallVenueEvent(s).s)
    const v = guideView(s)!
    expect(v.current!.id).toBe('matchup')
    expect(v.steps.find((x) => x.id === 'card')!.blocker).toMatch(/agreed fight/)
  })
  it('a fight on a rival’s card counts as an agreed fight, but never as running your own show', () => {
    let s = syncGuide(ackGuideStep(syncGuide(fresh()), 'position'))
    const rival = Object.values(s.promotions).find((p) => !p.isPlayer && p.ai)!
    const me = mine(s)[0]
    const opp = freeFighter(s, new Set([me]), (id) => validateMatch(s, me, id).ok)[0]
    const f = createFight(s, me, opp.id, rival.id, 'ai'); agreeFight(s, f, { purseB: 3_000, winBonusB: 300, rematch: false, venuePref: 'neutral', fights: 1 })
    s = syncGuide(s)
    expect(doneIds(s)).toContain('matchup')
    expect(doneIds(s)).not.toContain('show')
    expect(cur(s)).toBe('venue') // the next thing is still the player's own show
  })
  it('optional steps never block: the current step is always a required one', () => {
    let s = syncGuide(fresh())
    for (const id of ['position'] as const) s = ackGuideStep(s, id)
    expect(guideView(s)!.steps.find((x) => x.id === 'scout')!.optional).toBe(true)
    expect(guideView(s)!.current!.optional).toBe(false)
  })
  it('signing a new fighter ticks the optional step; a fighter you started with does not', () => {
    const s = syncGuide(fresh())
    expect(guideView(s)!.steps.find((x) => x.id === 'sign')!.done).toBe(false)
    const free = Object.values(s.fighters).find((f) => f.status === 'active' && f.contractId === null)!
    const base = Object.values(s.contracts).find((c) => c.promotionId === s.playerPromotionId)!
    s.contracts['c_new'] = { ...base, id: 'c_new', fighterId: free.id }
    free.contractId = 'c_new'
    expect(guideView(syncGuide(s))!.steps.find((x) => x.id === 'sign')!.done).toBe(true)
  })
})

describe('progress persists with the career', () => {
  it('round-trips through save and load, including skips', () => {
    let s = syncGuide(ackGuideStep(syncGuide(fresh()), 'position'))
    s = skipGuideStep(s, 'matchup')
    const back = deserialiseGame(serialiseGame(s))!
    expect(back.guide).toEqual(s.guide)
    expect(cur(back)).toBe('venue')
  })
  it('completed milestones are remembered even if the world later changes', () => {
    let s = syncGuide(fresh())
    const ev = smallVenueEvent(s); s = syncGuide(ev.s)
    expect(doneIds(s)).toContain('venue')
    s.events[ev.id].status = 'cancelled'; s = syncGuide(s)
    expect(doneIds(s)).toContain('venue')
  })
})

describe('dismissal, skipping and not coming back', () => {
  it('skip moves on without marking the step done; optional steps cannot be "skipped" because they never block', () => {
    const s0 = syncGuide(fresh())
    expect(skipGuideStep(s0, 'scout')).toBe(s0)
    expect(skipGuideStep(s0, 'venue')).toBe(s0) // not the current step
    const s = skipGuideStep(s0, 'position')
    expect(cur(s)).toBe('matchup')
    expect(guideView(s)!.steps.find((x) => x.id === 'position')!.done).toBe(false)
    expect(guideView(s)!.progress.done).toBe(1)
  })
  it('hiding the guide stays hidden through further play, even when milestones are reached', () => {
    let s = dismissGuide(syncGuide(fresh()))
    expect(guideView(s)).toBeNull()
    s = firstShow(s).s
    expect(guideView(s)).toBeNull()
    expect(s.guide!.active).toBe(false)
    expect(s.guide!.dismissed).toBe(true)
  })
  it('a finished guide does not reappear, and restarting it is an explicit act', () => {
    let { s } = firstShow(fresh())
    s = ackGuideStep(ackGuideStep(s, 'position'), 'review'); s = ackGuideStep(s, 'next')
    expect(s.guide!.finished).toBeDefined()
    for (let i = 0; i < 6; i++) s = syncGuide(advanceOneWeek(s))
    expect(guideView(s)).toBeNull()
    const again = startGuide(s)
    const v = guideView(again)!
    expect(again.guide!.finished).toBeUndefined()
    expect(v.steps.find((x) => x.id === 'show')!.done).toBe(true) // what already happened shows as done
    expect(v.current!.id).toBe('position')
  })
})

describe('existing saves', () => {
  const asV12 = (s: GameState): GameState => { const raw = JSON.parse(serialiseGame(s)); raw.version = 12; delete raw.guide; return deserialiseGame(JSON.stringify(raw))! }
  it('migrate to the current version with the guide present but off, and show no onboarding', () => {
    const old = asV12(fresh('p7-old'))
    expect(old.version).toBe(GAME_STATE_VERSION)
    expect(old.guide).toBeDefined(); expect(old.guide!.active).toBe(false)
    expect(guideView(old)).toBeNull()
    expect(syncGuide(old)).toBe(old) // inactive guide: a pure no-op
  })
  it('migration changes nothing else about the career', () => {
    const s = fresh('p7-old2'); const old = asV12(s)
    const strip = (x: GameState) => { const j = JSON.parse(serialiseGame(x)); delete j.guide; j.version = 0; return j }
    expect(strip(old)).toEqual(strip(s))
  })
  it('an established career can ask for the guide; it reads the career and changes nothing in it', () => {
    let s = asV12(fresh('p7-old3'))
    s = firstShow(s).s
    const before = JSON.parse(serialiseGame(s)); delete before.guide
    const g = startGuide(s)
    expect(guideView(g)!.steps.find((x) => x.id === 'show')!.done).toBe(true)
    const after = JSON.parse(serialiseGame(g)); delete after.guide
    expect(after).toEqual(before)
    expect(dismissGuide(g).guide!.dismissed).toBe(true)
  })
  it('a save with no guide record at all (a hand-edited or partial state) is simply not guided', () => {
    const s = fresh(); delete s.guide
    expect(guideView(s)).toBeNull(); expect(syncGuide(s)).toBe(s); expect(dismissGuide(s).guide!.active).toBe(false)
  })
})

describe('the guide grants nothing and cannot change the simulation', () => {
  it('a guided and an unguided world stay identical week after week', () => {
    const a = fresh('p7-same'); const b = fresh('p7-same'); b.guide = { ...b.guide!, active: false }
    let x = a, y = b
    for (let i = 0; i < 12; i++) { x = syncGuide(advanceOneWeek(x)); y = advanceOneWeek(y) }
    const strip = (s: GameState) => { const j = JSON.parse(serialiseGame(s)); delete j.guide; return j }
    expect(strip(x)).toEqual(strip(y))
  }, 60_000)
  it('the money the guide quotes is the money the show really made', () => {
    const { s, eventId } = firstShow(fresh('p7-money'))
    const r = s.events[eventId].result!
    const text = guideView(s)!.steps.find((x) => x.id === 'review')!.facts!.join(' ')
    expect(text).toContain(Math.abs(Math.round(r.profit)).toLocaleString('en-GB'))
    expect(text).toContain(r.attendance.toLocaleString('en-GB'))
  })
})

describe('contextual help', () => {
  it('every topic explains what it is, why it matters and what to do, in plain words', () => {
    for (const [k, h] of Object.entries(HELP)) {
      expect(h.title.length, k).toBeGreaterThan(5)
      for (const part of [h.what, h.why, h.next]) expect(part.length, k).toBeGreaterThan(20)
      expect(`${h.what} ${h.why} ${h.next}`, k).not.toMatch(/\bpotential\b|hidden attribute|\bchin\b|discipline/i)
    }
    expect(Object.keys(HELP).length).toBeGreaterThanOrEqual(10)
  })
})
