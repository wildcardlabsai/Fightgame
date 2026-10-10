/** Phase 6.0 — the view-model additions the new screens read. */
import { describe, expect, it } from 'vitest'
import { createNewGame } from './worldgen'
import { advanceOneWeek } from './tick'
import { fightListItem } from './fightViews'
import type { GameState } from './types'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }

describe('fight list items say what a bout is for, and whether it is a proposal or a booking', () => {
  it('title and eliminator fights carry a labelled stake; ordinary bouts carry none; phase follows status', () => {
    let s: GameState = createNewGame({ seed: 'p60', promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
    let titled = 0, plain = 0, checked = 0
    for (let w = 1; w <= 2 * 52 && (titled < 3 || plain < 3); w++) {
      s = advanceOneWeek(s)
      if (w % 8) continue
      for (const f of Object.values(s.fights)) {
        const item = fightListItem(s, f.id)
        if (!item) continue
        checked++
        expect(item.phase).toBe(f.status === 'negotiating' ? 'negotiating' : f.status === 'postFight' ? 'done' : 'booked')
        if (item.stake) { titled++; expect(item.stake.label).toMatch(/^(Title|Eliminator|Unification|Mandatory)/); expect(['title', 'eliminator', 'unification', 'mandatory']).toContain(item.stake.kind) }
        else plain++
        // a finished fight's stake is read from the title it actually carried, never inferred
        if (f.status === 'postFight') expect(!!item.stake).toBe(!!f.title?.kind)
      }
    }
    expect(checked).toBeGreaterThan(20)
    expect(plain).toBeGreaterThan(0)
    expect(titled, "the world staged at least one title or eliminator fight").toBeGreaterThan(0)
  }, 240_000)

  it('building the list items does not change the game state', () => {
    let s: GameState = createNewGame({ seed: 'p60b', promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
    for (let i = 0; i < 30; i++) s = advanceOneWeek(s)
    const before = JSON.stringify(s)
    for (const f of Object.values(s.fights)) fightListItem(s, f.id)
    expect(JSON.stringify(s)).toBe(before)
  })
})
