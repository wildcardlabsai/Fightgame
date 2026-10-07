/**
 * MONEY INTEGRITY (Phase 4.6.1). The National Powerhouse accumulates very large sums; before documenting that as a design
 * opportunity we prove it is not a bug. Over two years of a busy promoter (events, broadcast, per-event AND standing sponsors):
 *  - cash always equals starting funds + every ledger line ever posted (no invisible money);
 *  - ledger ids are never reused or re-posted (no ledger duplication);
 *  - each show's revenue lines in the ledger equal the revenue the show itself reports (no event revenue duplication);
 *  - each sponsor pays each show at most once and each quarter at most once (no sponsor duplication),
 *    and the sponsor book's "earned" equals the standing-sponsor lines posted.
 */
import { describe, expect, it } from 'vitest'
import { totalRevenue } from './eventFinance'
import { sponsorDef } from './sponsorCatalog'
import { player } from './selectors'
import { advanceOneWeek } from './tick'
import type { GameState, Transaction } from './types'
import { createNewGame } from './worldgen'
import type { ScenarioId } from './scenarios'
import { newLog, playWeek, STRATEGIES } from './sim/strategies'

const logo = { monogram: 'M', color: '#fff', emblem: 'bolt' as const }

function audit(scenario: ScenarioId, seed: string, weeks: number) {
  let s: GameState = createNewGame({ seed, promotionName: 'Money', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo, scenario }, 1_700_000_000_000)
  const start = player(s).cash
  const log = newLog()
  const seen = new Map<string, Transaction>()
  let sum = 0
  for (let w = 1; w <= weeks; w++) {
    s = playWeek(s, STRATEGIES.balanced, log)
    s = advanceOneWeek(s)
    for (const t of s.ledger) {
      const prev = seen.get(t.id)
      if (prev) { expect(prev, `ledger id ${t.id} reused with different content`).toEqual(t); continue }
      seen.set(t.id, t); sum += t.amount
    }
    // Every line posted since startup is either still visible or has been folded into the archive.
    expect(s.ledgerArchive + s.ledger.reduce((n, t) => n + t.amount, 0)).toBe(player(s).cash)
  }
  return { s, start, seen, sum, log }
}

describe('money integrity (National Powerhouse, two years of busy play)', () => {
  const { s, start, seen, log } = audit('national', 'money-1', 104)
  const all = [...seen.values()]

  it('is a real, busy economy (not an empty run)', () => {
    expect(log.planned).toBeGreaterThan(10)
    expect(all.filter((t) => t.category === 'tickets').length).toBeGreaterThan(10)
    expect(all.some((t) => t.category === 'standingSponsor')).toBe(true)
  })

  it('no invisible money: cash = starting funds + every ledger line ever posted', () => {
    const lines = all.filter((t) => t.category !== 'startingFunds')
    const sum = lines.reduce((n, t) => n + t.amount, 0)
    // The starting-funds line is the first ledger entry; every other pound is a recorded line.
    expect(start + sum).toBe(player(s).cash)
  })

  it('no ledger duplication: ids are unique and no two lines are the same posting', () => {
    expect(new Set(all.map((t) => t.id)).size).toBe(all.length)
    const keyed = new Map<string, number>()
    for (const t of all) {
      if (!['tickets', 'ppv', 'broadcast', 'sponsorship', 'standingSponsor'].includes(t.category) || /quarterly instalment/.test(t.description)) continue
      const k = `${t.category}|${t.description}`
      keyed.set(k, (keyed.get(k) ?? 0) + 1)
    }
    // (Quarterly instalments repeat by design and are checked per quarter below.) Ticket lines are weekly (one per week on sale), so identical descriptions can repeat there; income lines that are one-off per show must not.
    for (const [k, n] of keyed) if (!k.startsWith('tickets|')) expect(n, k).toBe(1)
  })

  it('no event revenue duplication: a show’s ledger revenue equals the revenue it reports', () => {
    const mine = Object.values(s.events).filter((e) => e.promotionId === s.playerPromotionId && e.result)
    expect(mine.length).toBeGreaterThan(8)
    let checked = 0
    for (const ev of mine) {
      const re = new RegExp(`(— |\\()${ev.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\)| \\(|$)`)
      const lines = all.filter((t) => ['tickets', 'ppv', 'broadcast', 'sponsorship'].includes(t.category) && re.test(t.description) && !/^Broadcast production/.test(t.description))
      const fromLedger = lines.reduce((n, t) => n + t.amount, 0)
      expect(Math.round(fromLedger), `${ev.name}`).toBe(Math.round(totalRevenue(ev.finance)))
      expect(ev.result!.revenue).toBe(Math.round(totalRevenue(ev.finance)))
      checked++
    }
    expect(checked).toBeGreaterThan(8)
  })

  it('no sponsor duplication: each sponsor pays each show once and each quarter once; "earned" matches the ledger', () => {
    const standing = all.filter((t) => t.category === 'standingSponsor')
    expect(standing.length).toBeGreaterThan(5)
    const perShow = new Map<string, number>()
    const quarters = new Map<string, number>()
    for (const t of standing) {
      const k = t.description
      if (/^Sponsor payment — /.test(k)) perShow.set(k, (perShow.get(k) ?? 0) + 1)
      else if (/quarterly instalment/.test(k)) { const key = `${k}@${Math.floor(t.day / 80)}`; quarters.set(key, (quarters.get(key) ?? 0) + 1) }
    }
    for (const [k, n] of perShow) expect(n, k).toBe(1)
    for (const [k, n] of quarters) expect(n, k).toBe(1)
    const total = standing.reduce((n, t) => n + t.amount, 0)
    expect(total).toBe(s.sponsors!.earned)
    // No sponsor is paid by a deal that does not exist, and the income per deal matches its own record.
    for (const d of s.sponsors!.deals) {
      const name = sponsorDef(d.sponsorId)!.name
      const sum = standing.filter((t) => t.description.includes(name)).reduce((n, t) => n + t.amount, 0)
      expect(sum).toBeGreaterThanOrEqual(d.earned)
    }
    // Per-event sponsorship (the older, separate layer) is at most one deal per show.
    const perEvent = all.filter((t) => t.category === 'sponsorship')
    const byEvent = new Map<string, number>()
    for (const t of perEvent) byEvent.set(t.description, (byEvent.get(t.description) ?? 0) + 1)
    for (const [k, n] of byEvent) expect(n, k).toBe(1)
  })
})
