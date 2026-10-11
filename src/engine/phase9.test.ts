/**
 * Phase 9: forecast clarity. The event economics the player sees must reconcile with what settlement actually posts, and must tell the truth about a
 * forecast loss without inventing controls or promising a profit.
 */
import { describe, expect, it } from 'vitest'
import { createNewGame } from './worldgen'
import { advanceOneWeek } from './tick'
import { createFight, validateMatch } from './fights'
import { agreeFight } from './fightNegotiation'
import { addFight, createEvent, putOnSale } from './events/events'
import { runEventToEnd } from './commands'
import { eventView } from './eventViews'
import { forecastEvent } from './events/demand'
import { BALANCE as B } from './balance'
import { useGame } from '../store/gameStore'
import type { GameState, Id } from './types'

const E = B.events
const SAT = 5
const fresh = (seed: string, scenario: 'groundUp' | 'regional' | 'national' = 'regional'): GameState =>
  createNewGame({ seed, promotionName: 'Ironbridge Boxing', promoterName: 'Sam Reid', homeCountry: 'ENG', difficulty: 'standard', logo: { emblem: 'glove', color: '#e11d2a', monogram: 'IB' }, scenario }, 1)

function agreeFights(s: GameState, n: number): Id[] {
  const used = new Set<Id>(); const out: Id[] = []
  const my = new Set(Object.values(s.contracts).filter((c) => c.promotionId === s.playerPromotionId && c.status === 'active').map((c) => c.fighterId))
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

/** A show at the n-th smallest venue the promotion may book, with prices scaled by `priceScale`. Returns the state just after "put on sale". */
function onSaleShow(seed: string, venueRank: number, priceScale: number, scenario: 'groundUp' | 'regional' | 'national' = 'regional'): { s: GameState; id: Id } {
  let s = fresh(seed, scenario)
  const usable = Object.values(s.venues).filter((v) => !v.legacy).sort((a, b) => a.capacity - b.capacity).filter((v) => v.country === 'ENG').filter((v) => {
    const r = createEvent(structuredClone(s), { name: 'Probe', day: s.today + SAT + 7 * 8, venueId: v.id }); return r.ok
  })
  const v = usable[Math.min(venueRank, usable.length - 1)]
  let id: Id | null = null
  for (let wk = 6; wk < 14 && !id; wk++) { const r = createEvent(s, { name: 'Forecast Night', day: s.today + SAT + wk * 7, venueId: v.id }); if (r.ok) { s = r.state; id = r.eventId! } }
  for (const f of agreeFights(s, v.minFights)) { const r = addFight(s, id!, f); expect(r.ok).toBe(true); s = r.state }
  const e = s.events[id!]
  e.prices = { ga: Math.round(e.prices.ga * priceScale), premium: Math.round(e.prices.premium * priceScale), vip: Math.round(e.prices.vip * priceScale) }
  const sale = putOnSale(s, id!); expect(sale.ok, 'putOnSale').toBe(true)
  return { s: sale.state, id: id! }
}
function settle(s0: GameState, id: Id): GameState {
  let s = s0
  for (let i = 0; i < 20 && !['fightWeek', 'live'].includes(s.events[id].status); i++) s = advanceOneWeek(s)
  const r = runEventToEnd(s, id); expect(r.ok).toBe(true)
  return r.state
}

const CASES: [string, number, number][] = [['sold-out', 0, 1], ['partial', 10, 1], ['poor', 10, 4]]

describe('forecast economics reconcile with settlement', () => {
  for (const [name, rank, scale] of CASES) {
    it(`${name}: every line equals what settlement posts`, () => {
      const { s: before, id } = onSaleShow('p9-' + name, rank, scale)
      const view = eventView(before, id)!
      const ec = view.economics!, f = view.forecast!
      // the lines add up to the forecast the page already shows
      expect(ec.costTotal.lo).toBeCloseTo(f.costs.lo, 6); expect(ec.costTotal.hi).toBeCloseTo(f.costs.hi, 6)
      expect(ec.revenueTotal.lo).toBeCloseTo(f.revenue.lo, 6); expect(ec.revenueTotal.hi).toBeCloseTo(f.revenue.hi, 6)
      expect(ec.profit.lo).toBeCloseTo(ec.revenueTotal.lo - ec.costTotal.hi, 6); expect(ec.profit.hi).toBeCloseTo(ec.revenueTotal.hi - ec.costTotal.lo, 6)
      const after = settle(before, id)
      const ev = after.events[id]; const fin = ev.finance; const r = ev.result!
      const line = (k: string) => ec.costs.find((l) => l.key === k)?.lo ?? 0
      // costs that do not depend on the crowd are exact
      expect(fin.costs.venue).toBe(line('venue'))
      expect(fin.costs.purses).toBe(line('purses'))
      expect(fin.costs.production + fin.costs.broadcast).toBe(line('production') + line('broadcastProduction'))
      // costs that scale with the crowd follow the settlement formulas at the ACTUAL crowd and gate
      expect(Math.abs(fin.costs.security - r.attendance * E.costs.securityPerHead)).toBeLessThanOrEqual(1) // each posting is rounded to the pound
      expect(Math.abs(fin.costs.officials - (line('officials') + line('travel') + fin.revenue.tickets * E.costs.sanctionShare))).toBeLessThanOrEqual(2)
      // and the books balance: the profit shown after the show is exactly revenue minus every line
      const revenue = fin.revenue.tickets + fin.revenue.sponsorship + fin.revenue.broadcast + fin.revenue.ppv
      const costs = Object.values(fin.costs).reduce((n, x) => n + x, 0)
      expect(r.profit).toBeCloseTo(revenue - costs, 4)
      // a sell-out with no sponsor or broadcast lands on the full-house figure, give or take the win bonuses actually paid
      if (r.attendance >= before.venues[ev.venueId].capacity && !ev.sponsor.accepted && ev.broadcast.kind === 'none') {
        const bonusRoom = (ec.costs.find((l) => l.key === 'bonuses')?.hi ?? 0)
        expect(Math.abs(r.profit - ec.breakEven.fullHouse.profit)).toBeLessThanOrEqual(bonusRoom + 5)
      }
      console.log(name, 'att', r.attendance, '/', ec.breakEven.capacity, 'forecast', Math.round(f.attendance.lo), Math.round(f.attendance.hi), 'profit', Math.round(r.profit), 'range', Math.round(ec.profit.lo), Math.round(ec.profit.hi), 'BE', ec.breakEven.attendance, ec.breakEven.verdict, 'fullHouse', Math.round(ec.breakEven.fullHouse.profit))
    }, 120_000)
  }
})


describe('the account of a forecast loss is true', () => {
  it('the reported case: a small hall that sells out still loses, and the page says so before the show goes on sale', () => {
    const { s: before, id } = onSaleShow('p9-sold', 0, 1)
    const ec = eventView(before, id)!.economics!
    expect(ec.breakEven.verdict).toBe('beyondSellOut')
    expect(ec.breakEven.fullHouse.profit).toBeLessThan(0)
    expect(ec.explanation.join(' ')).toMatch(/sell-out would still lose/)
    expect(ec.explanation.join(' ')).toMatch(/cannot hold enough paying fans/)
    const after = settle(before, id)
    expect(after.events[id].result!.attendance).toBe(before.venues[after.events[id].venueId].capacity) // it did sell out…
    expect(after.events[id].result!.profit).toBeLessThan(0) // …and lost, as said
    // the biggest cost is named and is the purses (the reported driver)
    expect(ec.drivers[0].label).toBe('Fighter purses')
  })
  it('a poorly attended show: the page flagged the risk, the crowd was a fraction of the hall, and the result sits inside the forecast and agrees with break-even', () => {
    const { s: before, id } = onSaleShow('p9-poor', 10, 4)
    const view = eventView(before, id)!; const ec = view.economics!
    expect(ec.breakEven.attendance).not.toBeNull()
    expect(ec.breakEven.attendance!).toBeGreaterThan(view.forecast!.attendance.lo) // break-even sits inside the forecast crowd range: the page showed a real chance of a loss
    expect(ec.profit.lo).toBeLessThan(0)
    const r = settle(before, id).events[id].result!
    expect(r.attendance).toBeLessThan(0.2 * before.venues[before.events[id].venueId].capacity)
    expect(view.forecast!.risk).not.toBe('safe') // the page never called this show safe
    expect(r.profit).toBeGreaterThanOrEqual(ec.profit.lo); expect(r.profit).toBeLessThanOrEqual(ec.profit.hi)
    // the break-even is a fair guide: well below it the show loses, well above it the show does not
    if (r.attendance < ec.breakEven.attendance! * 0.9) expect(r.profit).toBeLessThan(0)
    if (r.attendance > ec.breakEven.attendance! * 1.15) expect(r.profit).toBeGreaterThan(-(ec.costs.find((l) => l.key === 'bonuses')!.hi))
  })
  it('a partly filled show that profits: actual crowd and profit fall inside the forecast ranges and above break-even', () => {
    const { s: before, id } = onSaleShow('p9-partial', 10, 1)
    const view = eventView(before, id)!; const ec = view.economics!
    const r = settle(before, id).events[id].result!
    expect(r.attendance).toBeGreaterThanOrEqual(view.forecast!.attendance.lo * 0.98); expect(r.attendance).toBeLessThanOrEqual(view.forecast!.attendance.hi * 1.02)
    expect(r.profit).toBeGreaterThanOrEqual(ec.profit.lo); expect(r.profit).toBeLessThanOrEqual(ec.profit.hi)
    expect(r.attendance).toBeGreaterThan(ec.breakEven.attendance!)
  })
  it('break-even is arithmetic, not a guess: at that crowd the forecast model returns to about zero', () => {
    for (const [seed, rank, scale] of [['p9-be-a', 3, 1], ['p9-be-b', 10, 2]] as const) {
      const { s, id } = onSaleShow(seed, rank, scale); const ev = s.events[id]
      const ec = eventView(s, id)!.economics!; const N = ec.breakEven.attendance!
      const nonTicketLo = ec.revenueTotal.lo - ec.revenue.find((l) => l.key === 'tickets')!.lo
      const bonusesExpected = (ec.costs.find((l) => l.key === 'bonuses')!.lo) / 0.7
      const profitAt = N * ec.breakEven.avgTicket * (1 - E.costs.sanctionShare) - N * E.costs.securityPerHead - ec.committed - bonusesExpected + nonTicketLo
      expect(Math.abs(profitAt)).toBeLessThanOrEqual(ec.breakEven.avgTicket) // within one ticket (the crowd is a whole number)
      void ev
    }
  })
  it('levers are real controls and nothing promises a profit', () => {
    const { s, id } = onSaleShow('p9-lever', 0, 1)
    const ev = s.events[id]
    const v = eventView(s, id)!
    const texts = v.economics!.levers.map((l) => l.text).join(' ')
    expect(texts).not.toMatch(/guarantee|will make|will be profitable|ensure a profit/i)
    for (const l of v.economics!.levers) {
      if (l.id === 'sponsors') expect(ev.sponsor.offers.length).toBeGreaterThan(0)
      if (l.id === 'venue') { const n = l.text.match(/better at (.+?),/); expect(n).not.toBeNull() }
      if (l.id === 'prices') expect(['venueBooked', 'cardBuilding', 'onSale', 'promoting']).toContain(ev.status)
    }
    // a profitable show gets no loss explanation at all
    const big = onSaleShow('p9-lever-big', 12, 1); const ec2 = eventView(big.s, big.id)!.economics!
    expect(ec2.profit.lo).toBeGreaterThan(0); expect(ec2.explanation).toEqual([])
  })
  it('the forecast the page shows is unchanged by the new breakdown (same ranges, same risk)', () => {
    const { s, id } = onSaleShow('p9-same', 5, 1)
    const direct = forecastEvent(s, s.events[id]); const v = eventView(s, id)!.forecast!
    expect(v.profit).toEqual(direct.profit); expect(v.risk).toBe(direct.risk)
  })
})

describe('one set of numbers', () => {
  it('"cash after the poor case" on the page equals the advisor’s figure on the sale confirmation', async () => {
    const { eventAdvice } = await import('./advisor')
    let s = fresh('p9-cash', 'groundUp')
    const v = Object.values(s.venues).filter((x) => !x.legacy).sort((a, b) => a.capacity - b.capacity)[0]
    let id: Id | null = null
    for (let wk = 6; wk < 14 && !id; wk++) { const r = createEvent(s, { name: 'Cash Night', day: s.today + SAT + wk * 7, venueId: v.id }); if (r.ok) { s = r.state; id = r.eventId! } }
    for (const f of agreeFights(s, v.minFights)) s = addFight(s, id!, f).state
    const ec = eventView(s, id!)!.economics!
    const fact = eventAdvice(s, id!).flatMap((a) => a.facts ?? []).find((x) => x.label === 'Cash after (worst case)')
    expect(fact).toBeDefined()
    expect(ec.cashAfterWorst).toBe(fact!.money)
  })
})

describe('inbox priority', () => {
  const world = (() => { let s = fresh('p9-inbox', 'regional'); for (let i = 0; i < 26; i++) s = advanceOneWeek(s); return s })()
  it('every message gets exactly one tier, and nothing is dropped or hidden by classifying or folding', async () => {
    const { inboxItems, foldItems, inboxSummary } = await import('./inboxViews')
    const items = inboxItems(world)
    expect(items).toHaveLength(world.inbox.length)
    expect(new Set(items.map((i) => i.msg.id)).size).toBe(world.inbox.length)
    const rows = foldItems(items)
    const shown = rows.flatMap((r) => (r.kind === 'one' ? [r.item] : r.items))
    expect(shown.map((i) => i.msg.id).sort()).toEqual(world.inbox.map((m) => m.id).sort())
    const sum = inboxSummary(world, items)
    expect(Object.values(sum.total).reduce((a, b) => a + b, 0)).toBe(world.inbox.length)
    expect(sum.open).toBe(items.filter((i) => i.open).length)
    // the volume really is mostly repeatable information that folds, so the list is shorter than the inbox
    expect(rows.length).toBeLessThan(items.length)
  })
  it('an offer is a decision while it is open and a record once it is not — the message is never deleted', async () => {
    const { classify } = await import('./inboxViews')
    const s = structuredClone(world)
    const offer = s.inbox.find((m) => m.key?.startsWith('offer-'))
    if (!offer) return // this world produced no rival offer in 26 weeks: covered by the browser walkthrough
    const id = offer.key!.slice('offer-'.length)
    s.office!.offers[id] = { ...s.office!.offers[id], status: 'open' }
    expect(classify(s, offer)).toEqual({ tier: 'action', open: true })
    s.office!.offers[id].status = 'agreed'
    expect(classify(s, offer)).toEqual({ tier: 'action', open: false })
    expect(s.inbox.some((m) => m.id === offer.id)).toBe(true)
  })
  it('mandatory challenges are championship news and still need attention; money warnings are never closed', async () => {
    const { classify } = await import('./inboxViews')
    const mk = (over: Partial<GameState['inbox'][number]>): GameState['inbox'][number] => ({ id: 'x', day: 1, from: 'F', subject: 'x', body: 'b', category: 'world', priority: 'normal', read: false, ...over })
    expect(classify(world, mk({ key: 'mand-b1', subject: 'TITLE SHOT: A is the mandatory challenger', category: 'contract', priority: 'important' }))).toEqual({ tier: 'championship', open: true })
    expect(classify(world, mk({ key: 'cash-8', subject: 'Cash is running low', category: 'finance', priority: 'urgent' }))).toEqual({ tier: 'action', open: true })
    expect(classify(world, mk({ subject: 'RANKING UPDATE: A is now #3', category: 'world' }))).toEqual({ tier: 'updates', open: false })
    expect(classify(world, mk({ subject: 'Result: A beats B', category: 'fighter' }))).toEqual({ tier: 'results', open: false })
  })
  it('a fighter asking for a fight stops being a decision once they are booked', async () => {
    const { classify } = await import('./inboxViews')
    const s = structuredClone(world)
    const fid = Object.values(s.contracts).find((c) => c.promotionId === s.playerPromotionId)!.fighterId
    const msg = { id: 'w', day: s.today, from: 'Agent', subject: 'Someone wants a fight', body: '', category: 'fighter' as const, priority: 'important' as const, read: false, link: { kind: 'fighter' as const, id: fid } }
    s.fighters[fid].activeFightId = null; s.fighters[fid].status = 'active'
    expect(classify(s, msg).open).toBe(true)
    s.fighters[fid].activeFightId = 'ft_x'
    expect(classify(s, msg).open).toBe(false)
  })
})

describe('toasts', () => {
  it('never more than two at once, a warning is not pushed out by a note, and message counts add up instead of stacking', () => {
    const g = useGame.getState()
    g.startNewGame({ seed: 'p9-toast', promotionName: 'Toast Boxing', promoterName: 'Sam Reid', homeCountry: 'ENG', difficulty: 'standard', logo: { emblem: 'glove', color: '#e11d2a', monogram: 'TB' }, scenario: 'regional' })
    useGame.setState({ notices: [] })
    g.notify('Autosave failed — export your save to be safe.', 'bad', false)
    g.notify('One', 'neutral', false); g.notify('Two', 'neutral', false); g.notify('Three', 'good', false)
    const n = useGame.getState().notices
    expect(n.length).toBeLessThanOrEqual(2)
    expect(n.some((x) => x.tone === 'bad')).toBe(true)
    expect(n[n.length - 1].text).toBe('Three')
    useGame.setState({ notices: [] })
    const before = useGame.getState().game!.inbox.length
    for (let i = 0; i < 6; i++) useGame.getState().advance(1)
    const mail = useGame.getState().notices.filter((x) => x.key === 'mail')
    const gained = useGame.getState().game!.inbox.length - before
    expect(mail.length).toBeLessThanOrEqual(1)
    if (gained > 0 && mail.length) expect(mail[0].count).toBeLessThanOrEqual(gained)
  }, 60_000)
})

describe('long careers fit the text-only save fallback', () => {
  it('a six-year career is stored compressed in localStorage, loads back identical, and old plain-JSON slots still load', async () => {
    const { SaveVault, localStorageBackend } = await import('./persistence')
    const { serialiseGame, deserialiseGame } = await import('./save')
    let s = fresh('p9-ls', 'regional'); for (let i = 0; i < 6 * 52; i++) s = advanceOneWeek(s)
    const json = serialiseGame(s)
    // a Storage with a 1.5 MB budget: the plain JSON of this career (several MB) cannot possibly fit; the compressed one does
    const data = new Map<string, string>(); const QUOTA = 1_500_000
    const ls = { getItem: (k: string) => data.get(k) ?? null, removeItem: (k: string) => { data.delete(k) }, key: () => null, clear: () => data.clear(), length: 0,
      setItem: (k: string, v: string) => { const used = [...data.entries()].filter(([x]) => x !== k).reduce((n, [, y]) => n + y.length, 0); if (used + v.length > QUOTA) throw new Error('QuotaExceededError'); data.set(k, v) } } as unknown as Storage
    expect(json.length).toBeGreaterThan(QUOTA)
    const vault = new SaveVault(localStorageBackend(ls))
    const meta = await vault.save(s)
    expect(meta.compressed).toBe(true)
    expect(meta.bytes).toBeLessThan(json.length * 0.3)
    const back = await vault.load(meta.id)
    expect(back).not.toBeNull()
    expect(JSON.parse(serialiseGame(back!))).toEqual(JSON.parse(json))
    // a slot written by an older build (plain JSON text) is still readable
    data.set('fightempire:vault:legacy', serialiseGame(fresh('p9-ls-old')))
    data.set('fightempire:vault:meta', JSON.stringify([{ id: 'legacy', gameId: 'x', name: 'old', promotionName: 'Ironbridge Boxing', today: 1, savedAt: 1, version: 13, slot: 'manual', bytes: 1, compressed: false }, ...JSON.parse(data.get('fightempire:vault:meta')!)]))
    expect((await vault.load('legacy'))?.version).toBe(13)
    void deserialiseGame
  }, 300_000)
})
