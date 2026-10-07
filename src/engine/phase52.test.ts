/**
 * Phase 5.2 — long-term fame. Wins add fame far faster than losses remove it, so before the cooling rule every active fighter
 * ratcheted upward whatever their record. These tests pin the rule and the world it produces.
 */
import { describe, expect, it } from 'vitest'
import { BALANCE as B } from './balance'
import { updateCondition } from './systems/development'
import { advanceOneWeek } from './tick'
import { createNewGame } from './worldgen'
import { commercialValue, mediaOf } from './media/popularity'
import type { Fighter, GameState } from './types'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const fresh = (seed: string) => createNewGame({ seed, promotionName: 'P52', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
const anchor = (f: Pick<Fighter, 'reputation'>) => B.fights.popularityCool.slope * f.reputation + B.fights.popularityCool.base

const cooled = (f: Fighter, today: number, weeks: number) => { for (let i = 0; i < weeks; i++) updateCondition(f, today); return f.popularity }
const activeFighter = (s: GameState): Fighter => Object.values(s.fighters).find((f) => f.status === 'active' && f.lastFightDay !== null)!

describe('fame above what the results justify cools; fame that is earned does not', () => {
  it('a journeyman far above his standing fades toward it, and never below it', () => {
    const s = fresh('p52-a')
    const f = { ...activeFighter(s), reputation: 36, popularity: 70, lastFightDay: s.today }
    const after = cooled(f, s.today, 104)
    expect(after).toBeLessThan(70 - 5)
    expect(after).toBeGreaterThanOrEqual(anchor(f))
  })
  it('an elite fighter whose fame matches his reputation keeps it (no cooling at the line)', () => {
    const s = fresh('p52-b')
    const f = { ...activeFighter(s), reputation: 85, popularity: 80, lastFightDay: s.today }
    expect(cooled(f, s.today, 260)).toBeCloseTo(80, 5)
  })
  it('a star only slightly above the line cools slowly: five years of no fights still leaves a strong name', () => {
    const s = fresh('p52-c')
    const f = { ...activeFighter(s), reputation: 80, popularity: 92, lastFightDay: s.today }
    expect(cooled(f, s.today, 260)).toBeGreaterThan(80)
  })
  it('cooling respects the old floor of 0.4 × reputation and never raises anyone', () => {
    const s = fresh('p52-d')
    const f = { ...activeFighter(s), reputation: 10, popularity: 3, lastFightDay: s.today }
    expect(cooled(f, s.today, 52)).toBe(3)
    const g = { ...activeFighter(s), reputation: 60, popularity: 50, lastFightDay: s.today }
    expect(cooled(g, s.today, 52)).toBe(50)
  })
})

describe('the world that results (six years, idle player)', () => {
  const world = (() => { let s: GameState | null = null; return () => { if (!s) { s = fresh('p52-world'); for (let i = 0; i < 6 * 52; i++) s = advanceOneWeek(s) } return s } })()
  it('almost nobody is far above their standing, yet stars exist and new names emerge', () => {
    const s = world()
    const act = Object.values(s.fighters).filter((f) => f.status === 'active')
    const inflated = act.filter((f) => f.popularity > anchor(f) + 20).length / act.length
    expect(inflated).toBeLessThan(0.08)
    expect(act.filter((f) => f.popularity >= 60).length).toBeGreaterThan(10)
    const rookies = act.filter((f) => f.record.wins + f.record.losses + f.record.draws <= 6)
    expect(rookies.length).toBeGreaterThan(20)
  }, 120_000)
  it('no runaway superstar monopoly: few fighters sit at the top of the scale', () => {
    const s = world()
    const act = Object.values(s.fighters).filter((f) => f.status === 'active')
    expect(act.filter((f) => f.popularity >= 95).length).toBeLessThanOrEqual(6)
  })
  it('the five public measures stay distinct and bounded', () => {
    const s = world()
    for (const f of Object.values(s.fighters).filter((x) => x.status === 'active')) {
      const m = mediaOf(s.media!, f)
      expect(f.popularity).toBeLessThanOrEqual(100); expect(f.popularity).toBeGreaterThanOrEqual(1)
      expect(m.interest).toBeLessThanOrEqual(100); expect(m.fanbase).toBeGreaterThanOrEqual(0)
      expect(commercialValue(s, s.media!, f)).toBeLessThanOrEqual(100)
    }
  })
})
