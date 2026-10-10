/**
 * Phase 5.6 - economy resilience. A promotion that is overdrawn (or has no fighters, no show and almost no money) has a fair, explicit way back:
 * the backers' bridge loan. It is a loan, not income; it is offered only in real distress, once at a time, at a price, and it leaves reckless
 * spending with the same consequences as before.
 */
import { describe, expect, it } from 'vitest'
import { createNewGame } from './worldgen'
import { advanceOneWeek } from './tick'
import { clone } from './media/testing'
import { post } from './ledger'
import { makeOffer } from './commands'
import { suggestedOffer } from './negotiation'
import { BRIDGE, floatFor, bridgeOffer, bridgeUnavailable, bridgeView, processBridge, takeBridge } from './systems/bridge'
import { attentionItems, financialHealth, player, playerRoster } from './selectors'
import { releaseFighter, takeBridgeLoan } from './commands'
import type { GameState } from './types'

const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const fresh = (seed = 'p56') => createNewGame({ seed, promotionName: 'P56', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
const setCash = (s: GameState, cash: number) => post(s, 'other', cash - player(s).cash, 'test: set cash')
const ledgerOk = (s: GameState) => expect(player(s).cash).toBe(s.ledgerArchive + s.ledger.reduce((n, t) => n + t.amount, 0))
const dropRoster = (s: GameState) => { let t = s; for (const f of playerRoster(t)) { const r = releaseFighter(t, f.id); if (r.ok) t = r.state } return t }

describe('the bridge loan', () => {
  it('is offered only to a promotion in real distress, with terms that follow from its books', () => {
    const s = fresh()
    expect(bridgeOffer(s)).toBeNull() // a healthy start
    const t = clone(s); setCash(t, -100_000)
    const o = bridgeOffer(t)!
    expect(o).toBeTruthy()
    expect(o.hole).toBe(100_000)
    expect(o.principal).toBe(Math.ceil((100_000 + floatFor(t)) / 5_000) * 5_000)
    expect(o.owed).toBe(Math.round(o.principal * (1 + BRIDGE.interest)))
    expect(o.weekly).toBe(Math.round(o.owed / BRIDGE.weeks))
    expect(JSON.stringify(bridgeOffer(clone(t)))).toBe(JSON.stringify(o)) // deterministic
    expect(o.why).toMatch(/overdrawn/)
  })

  it('also covers the other proven trap - no fighters, no show on the books, almost no money - but not a comfortable promotion without fighters', () => {
    const s = dropRoster(fresh())
    expect(playerRoster(s)).toHaveLength(0)
    const rich = clone(s); setCash(rich, 400_000)
    expect(bridgeOffer(rich)).toBeNull() // plenty of money to sign people: no need
    const poor = clone(s); setCash(poor, 20_000)
    const o = bridgeOffer(poor)!
    expect(o).toBeTruthy()
    expect(o.hole).toBe(0)
    expect(o.why).toMatch(/no fighters/)
  })

  it('is refused, with a reason, when the hole is too deep to trade out of', () => {
    const s = fresh(); setCash(s, -400_000)
    expect(bridgeOffer(s)).toBeNull()
    expect(bridgeUnavailable(s)).toMatch(/deeper than the backers will cover/)
    expect(takeBridge(s).ok).toBe(false)
    expect(bridgeView(s).offer).toBeNull()
    expect(bridgeView(s).danger).toMatch(/overdrawn/)
  })

  it('pays in through the ledger as a loan (not income), costs reputation, and is collected in equal weekly instalments until repaid, once per week', () => {
    let s = fresh(); setCash(s, -120_000)
    const rep0 = player(s).reputation
    const o = bridgeOffer(s)!
    const r = takeBridgeLoan(s); expect(r.ok).toBe(true); s = r.state
    expect(player(s).cash).toBe(-120_000 + o.principal)
    expect(s.ledger.find((t) => t.category === 'loan')!.amount).toBe(o.principal)
    expect(player(s).reputation).toBe(rep0 - BRIDGE.reputationCost)
    expect(s.bridge!.loan!.owed).toBe(o.owed)
    ledgerOk(s)
    // the same day twice collects once
    const a = clone(s); a.today += 7; processBridge(a); processBridge(a)
    expect(a.ledger.filter((t) => t.category === 'loanRepayment')).toHaveLength(1)
    // run it out
    let paid = 0, weeks = 0
    const counted = new Set<string>()
    for (; s.bridge!.loan && weeks < 200; weeks++) {
      s = advanceOneWeek(s)
      for (const t of s.ledger) if (t.category === 'loanRepayment' && !counted.has(t.id)) { counted.add(t.id); paid -= t.amount } // the visible ledger is bounded: count as we go
    }
    expect(s.bridge!.loan).toBeNull()
    expect(weeks).toBeLessThanOrEqual(BRIDGE.weeks + 1)
    expect(Math.abs(paid - o.owed)).toBeLessThanOrEqual(BRIDGE.weeks) // rounding of the weekly figure only
    ledgerOk(s)
    expect(s.inbox.some((m) => /bridge loan is repaid/i.test(m.subject))).toBe(true)
  }, 60_000)

  it('is one at a time, and not again for two years', () => {
    let s = fresh(); setCash(s, -50_000)
    s = takeBridgeLoan(s).state
    setCash(s, -50_000)
    expect(bridgeOffer(s)).toBeNull(); expect(bridgeUnavailable(s)).toMatch(/already running/)
    expect(takeBridgeLoan(s).ok).toBe(false)
    s.bridge!.loan = null // repaid early by some other means
    expect(bridgeUnavailable(s)).toMatch(/will not lend again/)
    s.today += (BRIDGE.cooldownWeeks + 1) * 7
    expect(bridgeOffer(s)).toBeTruthy()
  })
})

describe('recovery from a hole', () => {
  it('an overdrawn promotion cannot sign anyone, says why, and can after the bridge; reckless spending afterwards still ends in the same place', () => {
    let s = fresh('p56-rec'); s = dropRoster(s)
    setCash(s, -80_000)
    const free = Object.values(s.fighters).find((f) => f.status === 'active' && !f.contractId && f.reputation >= 10 && f.reputation < 45)!
    const offer = suggestedOffer(s, free, 'signing')
    const before = makeOffer(s, free.id, offer, 'signing')
    expect(before.ok).toBe(false)
    expect(before.error).toMatch(/cannot afford/)
    expect(before.error).toMatch(/overdrawn/)
    expect(attentionItems(s).some((i) => i.id === 'no-roster' && i.link && 'screen' in i.link && i.link.screen === 'finances')).toBe(true)
    s = takeBridgeLoan(s).state
    expect(player(s).cash).toBeGreaterThan(0)
    expect(financialHealth(s).state).not.toBe('insolvent')
    const after = makeOffer(s, free.id, suggestedOffer(s, free, 'signing'), 'signing')
    expect(after.ok).toBe(true) // the route back works through the ordinary signing flow
    // reckless: spend the float on nothing that earns, and the hole comes back with no second loan on offer
    s = after.state
    setCash(s, -10_000)
    expect(bridgeOffer(s)).toBeNull()
    expect(bridgeUnavailable(s)).toMatch(/already running/)
    let t = s
    for (let i = 0; i < 30; i++) t = advanceOneWeek(t)
    expect(player(t).cash).toBeLessThan(-10_000) // instalments and overheads keep coming
  }, 60_000)

  it('an older save with no bridge field plays on and gains it only when needed', () => {
    let s = fresh()
    delete (s as { bridge?: unknown }).bridge
    for (let i = 0; i < 3; i++) s = advanceOneWeek(s)
    expect(s.bridge).toBeUndefined()
    setCash(s, -30_000)
    const r = takeBridgeLoan(s); expect(r.ok).toBe(true)
    expect(r.state.bridge!.taken).toBe(1)
  })

  it('the insolvency notice points at the real way back', () => {
    let s = fresh(); setCash(s, -300_000)
    s = advanceOneWeek(s)
    const m = s.inbox.find((x) => x.subject === 'The promotion is insolvent')!
    expect(m.body).toMatch(/bridge loan/)
  })
})
