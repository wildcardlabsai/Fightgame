/**
 * Phase 5.8 - the signing-time forecast: what the terms on the table do to the books. Derived from live state, never stored, never a rule.
 */
import { describe, expect, it } from 'vitest'
import { createNewGame } from './worldgen'
import { clone } from './media/testing'
import { post } from './ledger'
import { makeOffer } from './commands'
import { suggestedOffer } from './negotiation'
import { breakEven } from './systems/breakEven'
import { takeBridge } from './systems/bridge'
import { signingForecast } from './systems/signingForecast'
import { player, playerRoster } from './selectors'
import type { Fighter, GameState, Offer } from './types'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const fresh = (seed = 'p58') => createNewGame({ seed, promotionName: 'P58', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
const freeAgents = (s: GameState): Fighter[] => Object.values(s.fighters).filter((f) => f.status === 'active' && !f.contractId && f.reputation >= 10 && f.reputation < 45).sort((a, b) => (a.id < b.id ? -1 : 1))
const fakeShows = (s: GameState, n: number, profit: number) => { for (let i = 0; i < n; i++) s.events[`fk${i}`] = { id: `fk${i}`, promotionId: s.playerPromotionId, day: s.today - 10 - i * 20, status: 'settled', card: [], result: { profit } } as never }
const aged = (s: GameState) => { s.today += 400; return s }
const offerFor = (s: GameState, f: Fighter, over: Partial<Offer> = {}): Offer => ({ ...suggestedOffer(s, f, 'signing'), ...over })

describe('signing-time forecast', () => {
  it('a first signing with no show history: recurring and immediate costs apart, no show estimate, no invented warning', () => {
    const s = fresh(); const f = freeAgents(s)[0]
    const o = offerFor(s, f, { weeklyRetainer: 400, signingBonus: 5_000 })
    const r = signingForecast(s, f.id, o, 'signing')!
    expect(r.confidence).toBe('insufficient')
    expect(r.confidenceLabel).toBe('Insufficient history')
    expect(r.upfront).toBe(5_000)
    expect(r.cashAfter).toBe(player(s).cash - 5_000)
    expect(r.retainerNew).toBe(400 * 52)
    expect(r.runningAfter).toBe(r.runningBefore + 400 * 52)
    expect(r.runningBefore).toBe(breakEven(s).annualRunning) // the same figure the Finances panel shows
    expect(r.neededAfter).toBeNull(); expect(r.coveredAfter).toBeNull()
    expect(r.summary).toMatch(/No reliable show history/)
    expect(r.warnings).toHaveLength(0)
    expect(r.rosterAfter).toBe(r.rosterBefore + 1)
  })

  it('when recent show profit would still cover the roster it says so and does not ask for more shows', () => {
    const s = aged(fresh()); fakeShows(s, 8, 90_000)
    const f = freeAgents(s)[0]
    const r = signingForecast(s, f.id, offerFor(s, f, { weeklyRetainer: 300, signingBonus: 2_000 }), 'signing')!
    expect(r.confidence).toBe('historical')
    expect(r.coveredBefore).toBe(true); expect(r.coveredAfter).toBe(true)
    expect(r.summary).toMatch(/would still cover/)
    expect(r.summary).not.toMatch(/shows a year would cover/)
    expect(r.warnings.some((w) => w.id === 'capacity')).toBe(false)
  })

  it('a contract that pushes running costs past what recent shows earned warns, with the difference quantified; it does not block the signing', () => {
    let s = aged(fresh()); const base = breakEven(s).annualRunning
    fakeShows(s, 7, Math.round((base + 20_000) / 7))
    const f = freeAgents(s)[0]
    const o = offerFor(s, f, { weeklyRetainer: 1_500, signingBonus: 1_000 })
    const r = signingForecast(s, f.id, o, 'signing')!
    const w = r.warnings.find((x) => x.id === 'capacity')!
    expect(w).toBeTruthy()
    const short = r.runningAfter - r.showProfit12m
    expect(short).toBeGreaterThan(0)
    expect(w.text).toContain(`£${short.toLocaleString('en-GB')}`)
    expect(r.neededAfter).not.toBeNull()
    expect(r.confidence).toBe('historical')
    const done = makeOffer(s, f.id, o, 'signing') // warning only: the deal is still legal
    expect(done.ok).toBe(true)
    s = done.state
    expect(s.fighters[f.id].contractId).toBeTruthy()
  })

  it('a large signing bonus that eats the working cash warns about weeks of costs left', () => {
    const s = aged(fresh()); post(s, 'other', 120_000 - player(s).cash, 'test'); fakeShows(s, 8, 90_000)
    const f = freeAgents(s)[0]
    const r = signingForecast(s, f.id, offerFor(s, f, { weeklyRetainer: 200, signingBonus: 100_000 }), 'signing')!
    expect(r.cashAfter).toBe(20_000)
    const w = r.warnings.find((x) => x.id === 'workingCash')!
    expect(w).toBeTruthy()
    expect(w.text).toContain('£20,000')
    expect(r.weeksOfCostsAfter).toBeLessThan(12)
  })

  it('counts a running bridge loan in the costs and warns when it is a large share and the contract adds to it', () => {
    const s = aged(fresh()); post(s, 'other', -200_000 - player(s).cash, 'test'); expect(takeBridge(s).ok).toBe(true)
    s.bridge!.loan!.weekly = 3_000 // a heavy loan: the instalments are a large share of the costs
    post(s, 'other', 400_000 - player(s).cash, 'test'); fakeShows(s, 8, 90_000)
    const f = freeAgents(s)[0]
    const r = signingForecast(s, f.id, offerFor(s, f, { weeklyRetainer: 500, signingBonus: 1_000 }), 'signing')!
    expect(r.debtService).toBe(s.bridge!.loan!.weekly * 52)
    expect(r.runningBefore).toBe(breakEven(s).annualRunning)
    expect(r.runningBefore).toBeGreaterThanOrEqual(r.debtService)
    expect(r.debtService).toBeGreaterThanOrEqual(r.runningBefore * 0.25)
    expect(r.warnings.some((w) => w.id === 'loan')).toBe(true)
    // and a light loan raises no loan warning
    s.bridge!.loan!.weekly = 100
    expect(signingForecast(s, f.id, offerFor(s, f, { weeklyRetainer: 500, signingBonus: 1_000 }), 'signing')!.warnings.some((w) => w.id === 'loan')).toBe(false)
  })

  it('an overdrawn promotion is told the bonus cannot be paid and where the way back is', () => {
    const s = fresh(); post(s, 'other', -40_000 - player(s).cash, 'test')
    const f = freeAgents(s)[0]
    const r = signingForecast(s, f.id, offerFor(s, f, { signingBonus: 8_000 }), 'signing')!
    const w = r.warnings.find((x) => x.id === 'overdrawn')!
    expect(w.text).toMatch(/overdrawn/); expect(w.text).toMatch(/Finances/)
    expect(r.cashAfter).toBe(-48_000)
  })

  it('succession: every forecast starts from the live roster, so a second signing sees the first one\'s cost (nothing is cached)', () => {
    let s = fresh(); const [a, b] = freeAgents(s)
    const oa = offerFor(s, a, { weeklyRetainer: 600, signingBonus: 1_000 })
    const before = signingForecast(s, b.id, offerFor(s, b, { weeklyRetainer: 600, signingBonus: 1_000 }), 'signing')!
    const done = makeOffer(s, a.id, oa, 'signing'); expect(done.ok).toBe(true); s = done.state
    const after = signingForecast(s, b.id, offerFor(s, b, { weeklyRetainer: 600, signingBonus: 1_000 }), 'signing')!
    expect(after.runningBefore).toBe(before.runningBefore + 600 * 52)
    expect(after.rosterBefore).toBe(before.rosterBefore + 1)
    expect(after.runningAfter - after.runningBefore).toBe(600 * 52)
    expect(after.cash).toBe(before.cash - 1_000)
  })

  it('a renewal replaces the current retainer instead of adding to it and does not add a roster place', () => {
    const s = fresh(); const mine = playerRoster(s)[0]; const c = s.contracts[mine.contractId!]
    const o: Offer = { ...suggestedOffer(s, mine, 'renewal'), weeklyRetainer: c.weeklyRetainer + 100, signingBonus: 0 }
    const r = signingForecast(s, mine.id, o, 'renewal')!
    expect(r.retainerOld).toBe(Math.round(c.weeklyRetainer * 52))
    expect(r.retainerNew).toBe(Math.round((c.weeklyRetainer + 100) * 52))
    expect(r.runningAfter - r.runningBefore).toBe(r.retainerNew - r.retainerOld)
    expect(r.rosterAfter).toBe(r.rosterBefore)
    const same = signingForecast(s, mine.id, { ...o, weeklyRetainer: c.weeklyRetainer }, 'renewal')!
    expect(same.runningAfter).toBe(same.runningBefore)
  })

  it('changes with the terms, is read-only, and copes with legacy saves that lack the newer finance fields', () => {
    const s = fresh(); const f = freeAgents(s)[0]
    delete (s as { bridge?: unknown }).bridge; delete (s as { office?: unknown }).office
    s.events = {} as never
    const snapshot = JSON.stringify(s)
    const lo = signingForecast(s, f.id, offerFor(s, f, { weeklyRetainer: 100 }), 'signing')!
    const hi = signingForecast(clone(s), f.id, offerFor(s, f, { weeklyRetainer: 900 }), 'signing')!
    expect(hi.runningAfter - lo.runningAfter).toBe(800 * 52)
    expect(JSON.stringify(s)).toBe(snapshot)
    expect(lo.confidence).toBe('insufficient')
    expect(signingForecast(s, 'nobody', offerFor(s, f), 'signing')).toBeNull()
  })

  it('warnings stay few: at most three, none for a modest contract on a promotion with a healthy cushion', () => {
    const s = aged(fresh()); post(s, 'other', 600_000 - player(s).cash, 'test'); fakeShows(s, 10, 120_000)
    const f = freeAgents(s)[0]
    const r = signingForecast(s, f.id, offerFor(s, f, { weeklyRetainer: 250, signingBonus: 3_000 }), 'signing')!
    expect(r.warnings).toHaveLength(0)
    expect(r.warnings.length).toBeLessThanOrEqual(3)
  })
})
