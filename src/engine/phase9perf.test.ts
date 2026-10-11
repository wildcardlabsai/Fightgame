/**
 * Phase 9: the weekly copy shares finished history. These tests prove it is invisible to the game: nothing edits a shared record, and a career
 * played with sharing is identical to one played with a full copy.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cloneForTick } from './clone'
import { createNewGame } from './worldgen'
import { advanceOneWeek } from './tick'
import { newLog, playWeek, STRATEGIES } from './sim/strategies'
import type { GameState } from './types'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const mk = (seed: string, scenario: 'groundUp' | 'regional' | 'national') => createNewGame({ seed, promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo, scenario }, 1_700_000_000_000)
const g = globalThis as { __PROMOTER_FREEZE_SHARED__?: boolean }
afterEach(() => { g.__PROMOTER_FREEZE_SHARED__ = false; (globalThis as { __PROMOTER_NO_SHARE__?: boolean }).__PROMOTER_NO_SHARE__ = false })

describe('shared history', () => {
  it('nothing in the game edits a settled fight or an archived event: shared records are frozen through years of play (passive and bot)', () => {
    g.__PROMOTER_FREEZE_SHARED__ = true
    for (const [seed, sc, bot] of [['f1', 'regional', false], ['f2', 'groundUp', false], ['f3', 'national', true]] as const) {
      let s = mk('freeze-' + seed, sc); const log = newLog()
      const weeks = bot ? 3 * 52 : 6 * 52 // a year past the 3-year prune horizon, so pruning and sharing both happen
      for (let w = 1; w <= weeks; w++) { if (bot) s = playWeek(s, STRATEGIES.balanced, log); s = advanceOneWeek(s) }
      const shared = Object.values(s.fights).filter((f) => Object.isFrozen(f)).length
      expect(shared, `${seed}: history was actually shared`).toBeGreaterThan(50)
    }
  }, 600_000)

  it('a career played with shared history equals the same career played with a full copy, week by week', () => {
    const a = mk('equal-1', 'regional'); let x = a, y = a
    const flags = globalThis as { __PROMOTER_NO_SHARE__?: boolean }
    const full = (s: GameState): GameState => { flags.__PROMOTER_NO_SHARE__ = true; try { return advanceOneWeek(s) } finally { flags.__PROMOTER_NO_SHARE__ = false } } // the reference path: a plain deep copy of everything
    for (let w = 1; w <= 4 * 52 + 10; w++) {
      x = advanceOneWeek(x)
      y = full(y)
      if (w % 26 === 0) expect(JSON.parse(JSON.stringify(x))).toEqual(JSON.parse(JSON.stringify(y)))
    }
  }, 600_000)

  it('the input state is never changed by a tick (purity), and shared records are the very same objects', () => {
    let s = mk('pure-1', 'regional')
    for (let w = 1; w <= 3 * 52; w++) s = advanceOneWeek(s)
    const before = JSON.stringify(s)
    const next = advanceOneWeek(s)
    expect(JSON.stringify(s)).toBe(before)
    const settled = Object.entries(s.fights).filter(([, f]) => (f.status === 'postFight' || f.status === 'processed') && typeof f.processedDay === 'number' && s.today - f.processedDay > 120)
    expect(settled.length).toBeGreaterThan(20)
    for (const [id] of settled) expect(next.fights[id]).toBe(s.fights[id])
    // recent history and anything unfinished is still a private copy
    const open = Object.entries(s.fights).filter(([, f]) => ['scheduled', 'training'].includes(f.status))
    for (const [id] of open) if (next.fights[id]) expect(next.fights[id]).not.toBe(s.fights[id])
    expect(cloneForTick(s)).not.toBe(s)
  }, 300_000)
})
