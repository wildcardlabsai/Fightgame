/** Shared test helper: builds a show in fight week and plays it out (not a test file). */
import { expect } from 'vitest'
import { addFightToEvent, approach, createEvent, offerFight, runEventToEnd, runNextEventFight } from './commands'
import { opponentCandidates } from './matchmaking'
import { playerRoster } from './selectors'
import { advanceOneWeek } from './tick'
import { suggestedFightOffer } from './fightNegotiation'
import { createNewGame } from './worldgen'
import type { FightOffer, GameState, Id } from './types'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
export const fresh = (seed: string) => createNewGame({ seed, promotionName: 'P48', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
const SAT = 5
export const satIn = (s: GameState, weeks: number) => s.today + SAT + 7 * (weeks - 1)

function agree(s: GameState, myId: Id, taken: Set<Id>): { state: GameState; fightId: Id } | null {
  for (const c of opponentCandidates(s, myId, {}).filter((x) => x.canApproach && !taken.has(x.view.id) && x.view.reputation < 50).slice(0, 8)) {
    const ap = approach(s, myId, c.view.id)
    if (!ap.ok) continue
    let st = ap.state
    for (let i = 0; i < 6; i++) {
      const base = suggestedFightOffer(st, c.view.id)
      const out = offerFight(st, ap.fightId!, { ...base, purseB: base.purseB * (1.2 + i * 0.4), winBonusB: base.winBonusB * 1.5 } as FightOffer)
      if (!out.ok) break
      st = out.state
      if (st.fights[ap.fightId!].status === 'agreed') { taken.add(c.view.id); return { state: st, fightId: ap.fightId! } }
      if (st.fights[ap.fightId!].status === 'cancelled') break
    }
  }
  return null
}

/** A finished show with recorded round-by-round data. */
export function playedShow(seed: string): { before: GameState; after: GameState; eventId: Id; fightIds: Id[] } {
  let s = fresh(seed)
  const venue = Object.values(s.venues).find((v) => v.name === 'Ironworks Social Club')!
  const r = createEvent(s, { name: 'Presentation Night', day: satIn(s, 8), venueId: venue.id })
  expect(r.ok, r.error).toBe(true)
  s = r.state
  const eventId = r.eventId!
  const taken = new Set<Id>()
  for (const f of playerRoster(s).slice(0, 3)) {
    const a = agree(s, f.id, taken)
    if (!a) continue
    const add = addFightToEvent(a.state, eventId, a.fightId)
    expect(add.ok, add.error).toBe(true)
    s = add.state
  }
  for (let i = 0; i < 20 && s.events[eventId].status !== 'fightWeek'; i++) s = advanceOneWeek(s)
  const before = s
  const run = runNextEventFight(s, eventId)
  expect(run.ok, run.error).toBe(true)
  const done = runEventToEnd(run.state, eventId)
  expect(done.ok, done.error).toBe(true)
  return { before, after: done.state, eventId, fightIds: s.events[eventId].card }
}

