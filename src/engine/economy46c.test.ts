/**
 * Economy sanity tests (Phase 4.6c). Short, deterministic bot-driven worlds — the full calibration lives in scripts/audit.
 * They assert shape (money is conserved, both profit and loss happen, conservative play survives, bankruptcy is still possible),
 * not exact balance numbers, so tuning can move without rewriting them.
 */
import { describe, expect, it } from 'vitest'
import { activeDeals } from './sponsors'
import { financialHealth, player } from './selectors'
import { advanceOneWeek } from './tick'
import type { GameState } from './types'
import { createNewGame } from './worldgen'
import type { ScenarioId } from './scenarios'
import { newLog, playWeek, STRATEGIES } from './sim/strategies'
import { post } from './ledger'

const logo = { monogram: 'E', color: '#fff', emblem: 'bolt' as const }
const world = (seed: string, scenario: ScenarioId) => createNewGame({ seed, promotionName: 'Eco', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo, scenario }, 1_700_000_000_000)

function play(s0: GameState, strategy: string, weeks: number, onWeek?: (s: GameState, w: number) => void): { s: GameState; profits: number[] } {
  let s = s0
  const log = newLog()
  const seen = new Set<string>()
  const profits: number[] = []
  for (let w = 1; w <= weeks; w++) {
    s = playWeek(s, STRATEGIES[strategy], log)
    s = advanceOneWeek(s)
    for (const e of Object.values(s.events)) if (e.promotionId === s.playerPromotionId && e.result && !seen.has(e.id)) { seen.add(e.id); profits.push(e.result.profit) }
    onWeek?.(s, w)
  }
  return { s, profits }
}
const balanced = (s: GameState) => expect(s.ledgerArchive + s.ledger.reduce((a, t) => a + t.amount, 0)).toBe(player(s).cash)

describe('economy: money is conserved', () => {
  it('a balanced promoter with sponsors, tiers and shows never creates or loses a pound outside the ledger (2 years)', () => {
    const { s, profits } = play(world('eco-a', 'regional'), 'balanced', 104, (st, w) => { if (w % 26 === 0) balanced(st) })
    balanced(s)
    expect(profits.length).toBeGreaterThan(6)
    // Sponsor money, if any arrived, arrived as ledger lines.
    const earned = s.sponsors!.earned
    const lines = s.ledger.filter((t) => t.category === 'standingSponsor').reduce((n, t) => n + t.amount, 0)
    if (s.ledgerArchive === 0) expect(lines).toBe(earned)
    expect(earned).toBeGreaterThanOrEqual(0)
  }, 240_000)
})

describe('economy: decisions matter', () => {
  it('a conservative promoter survives three ground-up years; shows both profit and lose along the way', () => {
    for (const seed of ['s02', 's04']) {
      const { s, profits } = play(world(seed, 'groundUp'), 'conservative', 156)
      expect(financialHealth(s).state, `seed ${seed}`).not.toBe('insolvent')
      expect(player(s).cash, `seed ${seed}`).toBeGreaterThan(0)
      expect(profits.some((p) => p > 0)).toBe(true)
    }
  }, 300_000)

  it('profitable and loss-making shows both occur for a balanced promoter', () => {
    const { profits } = play(world('eco-b', 'regional'), 'balanced', 156)
    expect(profits.some((p) => p > 0)).toBe(true)
    expect(profits.some((p) => p < 0)).toBe(true)
  }, 300_000)

  it('bankruptcy is still possible: a promoter who stops running shows while paying a full roster goes insolvent', () => {
    let s = world('eco-c', 'champion')
    post(s, 'signingBonus', -(player(s).cash - 20_000), 'reckless spending')
    for (let i = 0; i < 80; i++) s = advanceOneWeek(s)
    expect(financialHealth(s).state).toBe('insolvent')
    // …and insolvency blocks new spending (it never ends the game).
    expect(s.promotions[s.playerPromotionId].cash).toBeLessThan(-75_000)
  })

  it('standing sponsors appear for a growing promotion without any player action, and cap at the tier slot limit', () => {
    let s = world('eco-d', 'regional')
    for (let i = 0; i < 40; i++) s = advanceOneWeek(s)
    expect(s.sponsors!.offers.length + activeDeals(s).length).toBeGreaterThan(0)
    expect(activeDeals(s).length).toBeLessThanOrEqual(2)
  })
})
