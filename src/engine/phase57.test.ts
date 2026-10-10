/**
 * Phase 5.7 - what staying open costs. The break-even panel reads the books only: weekly running costs against the completed shows of the last year.
 */
import { describe, expect, it } from 'vitest'
import { createNewGame } from './worldgen'
import { advanceOneWeek } from './tick'
import { clone } from './media/testing'
import { breakEven } from './systems/breakEven'
import { takeBridge } from './systems/bridge'
import { post } from './ledger'
import { player, weeklyBurn } from './selectors'
import type { GameState } from './types'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const fresh = () => createNewGame({ seed: 'p57', promotionName: 'P57', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
const fakeShow = (s: GameState, id: string, daysAgo: number, profit: number) => {
  s.events[id] = { id, promotionId: s.playerPromotionId, day: s.today - daysAgo, status: 'settled', card: [], result: { profit } } as never
}

describe('what staying open costs', () => {
  it('a startup\'s annual running cost is what the weekly burn says it is, and matches what the ledger actually charges over a year', () => {
    let s = fresh()
    const b = breakEven(s)
    expect(b.annualRunning).toBe(Math.round(weeklyBurn(s).total * 52))
    expect(b.overhead).toBe(Math.round(weeklyBurn(s).overheads * 52))
    expect(b.verdict).toBe('unknown')
    expect(b.shows).toBe(0)
    // a passive year: the ledger's running-cost categories add up to the figure shown (the fixed lines; retainers fall away as contracts expire)
    const seen = new Set<string>(); let charged = 0
    const retainersAtStart = weeklyBurn(s).retainers
    for (let w = 0; w < 52; w++) {
      s = advanceOneWeek(s)
      for (const t of s.ledger) if (!seen.has(t.id)) { seen.add(t.id); if (['office', 'staff', 'gym', 'insurance'].includes(t.category)) charged -= t.amount }
    }
    expect(Math.abs(charged - (b.overhead + b.staff))).toBeLessThan(b.overhead * 0.02) // overhead + the scout's wage, to rounding
    expect(retainersAtStart).toBeGreaterThan(0)
  })

  it('counts shows from the last twelve months only, with their own profit, and says how many a year are needed', () => {
    const s = fresh(); s.today += 400
    fakeShow(s, 'e1', 30, 60_000); fakeShow(s, 'e2', 90, 40_000); fakeShow(s, 'e3', 150, -20_000); fakeShow(s, 'e4', 200, 100_000); fakeShow(s, 'old', 500, 900_000)
    const b = breakEven(s)
    expect(b.shows).toBe(4)
    expect(b.avgProfit).toBe(45_000)
    expect(b.medianProfit).toBe(60_000)
    expect(b.lossMaking).toBe(1)
    expect(b.annualProfit).toBe(180_000)
    expect(b.neededShows).toBeCloseTo(b.annualRunning / 45_000, 5)
    expect(b.fightsPerFighter).toBe(0) // no bouts on the books in this fixture
    expect(b.verdict).toBe(180_000 >= b.annualRunning ? 'covering' : 'short')
    if (b.verdict === 'short') expect(b.note).toMatch(new RegExp(`${Math.ceil(b.annualRunning / 45_000)} shows`))
  })

  it('says plainly when recent shows lose money, and does not judge a young promotion', () => {
    const s = fresh(); s.today += 400
    fakeShow(s, 'a', 20, -10_000); fakeShow(s, 'b', 60, -5_000); fakeShow(s, 'c', 100, 2_000)
    const b = breakEven(s)
    expect(b.verdict).toBe('short')
    expect(b.neededShows).toBeNull()
    expect(b.note).toMatch(/not making money/)
    const y = fresh(); fakeShow(y, 'a', 5, 50_000); fakeShow(y, 'b', 10, 50_000); fakeShow(y, 'c', 15, 50_000)
    expect(breakEven(y).verdict).toBe('unknown')
  })

  it('includes a running bridge-loan instalment in the cost of staying open', () => {
    const s = fresh(); post(s, 'other', -100_000 - player(s).cash, 'test')
    const before = breakEven(s).annualRunning
    expect(takeBridge(s).ok).toBe(true)
    const after = breakEven(s)
    expect(after.debtService).toBe(s.bridge!.loan!.weekly * 52)
    expect(after.annualRunning).toBe(Math.round((weeklyBurn(s).total + s.bridge!.loan!.weekly) * 52))
    expect(after.annualRunning).toBeGreaterThan(before)
  })

  it('is read-only: asking changes nothing', () => {
    const s = fresh()
    const a = JSON.stringify(s)
    breakEven(clone(s)); breakEven(s)
    expect(JSON.stringify(s)).toBe(a)
  })
})
