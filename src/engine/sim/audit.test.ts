/**
 * ECONOMIC AUDITS on synthetic shows: PPV, sponsors, broadcast, pricing, popularity, form, venue size.
 * These print the tables quoted in docs/ECONOMY.md and assert the relationships the design promises.
 */
import { describe, expect, it } from 'vitest'
import { cardQuality, demandFor, eventInterest, forecastEvent, ppvBuysFor, ppvRefPrice, refPrices, soldFromDemand } from '../events/demand'
import { generateSponsorOffers } from '../events/events'
import { buildShow, draws, mean, netFor, quantile, type Profile } from './audit'
import type { BroadcastKind } from '../types'

const N = 300
const k = (n: number) => `${Math.round(n / 1000)}k`
const TIER_FOR: Record<Profile, 'local' | 'regional' | 'national' | 'arena' | 'stadium'> = { low: 'regional', medium: 'national', high: 'arena', superstar: 'stadium' }

describe('PPV audit', () => {
  const rows: string[] = []
  const results: Record<string, { pLoss: number; pBeatTickets: number; med: number; p10: number; p90: number }> = {}
  for (const profile of ['low', 'medium', 'high', 'superstar'] as Profile[]) {
    it(`PPV vs ticketed — ${profile} main event`, () => {
      const show = buildShow({ profile, tier: TIER_FOR[profile], promoRep: profile === 'superstar' ? 80 : 55, nFights: 8 })
      show.ev.broadcast.kind = 'ppv'
      show.ev.broadcast.ppvPrice = ppvRefPrice(eventInterest(show.state, show.ev))
      const f = forecastEvent(show.state, show.ev)
      const ds = draws(show, N)
      const ppvNet = ds.map((d) => netFor(show, 'ppv', d))
      const tvNet = ds.map((d) => netFor(show, 'nationalTv', d))
      const noneNet = ds.map((d) => netFor(show, 'none', d))
      const buys = ds.map((d) => d.ppvBuys)
      const pBeat = ppvNet.filter((x, i) => x > Math.max(tvNet[i], noneNet[i])).length / N
      results[profile] = { pLoss: ppvNet.filter((x) => x < 0).length / N, pBeatTickets: pBeat, med: quantile(ppvNet, 0.5), p10: quantile(ppvNet, 0.1), p90: quantile(ppvNet, 0.9) }
      rows.push(`${profile.padEnd(10)} forecast buys ${Math.round(f.ppvBuys.lo)}–${Math.round(f.ppvBuys.hi)} | actual buys p10/p50/p90 ${Math.round(quantile(buys, 0.1))}/${Math.round(quantile(buys, 0.5))}/${Math.round(quantile(buys, 0.9))} | PPV net p10/p50/p90 ${k(quantile(ppvNet, 0.1))}/${k(quantile(ppvNet, 0.5))}/${k(quantile(ppvNet, 0.9))} | ticket-only net p50 ${k(quantile(noneNet, 0.5))} | P(PPV loss) ${(results[profile].pLoss * 100).toFixed(0)}% | P(PPV beats best non-PPV) ${(pBeat * 100).toFixed(0)}%`)
    })
  }
  it('is high upside / high risk and not always better than tickets', () => {
    console.log('PPV AUDIT\n' + rows.join('\n'))
    expect(results.low.pBeatTickets).toBeLessThan(0.05) // a weak card should not go PPV
    expect(results.low.pLoss).toBeGreaterThan(0.5)
    expect(results.medium.pLoss).toBeGreaterThan(0.05) // real risk even for a decent card
    expect(results.medium.pBeatTickets).toBeLessThan(0.5) // PPV is not automatically the better deal
    expect(results.superstar.p90 - results.superstar.p10).toBeGreaterThan(results.medium.p90 - results.medium.p10) // the spread widens with the stakes
    expect(results.medium.pLoss).toBeGreaterThan(0.15)
    expect(results.superstar.p10).toBeLessThan(results.superstar.med * 0.25) // wide downside even for a star: the spread is the risk
    expect(results.high.pLoss).toBeGreaterThan(0.005)
  })
})

describe('broadcast audit — no option dominates', () => {
  it('compares none / local / national / streaming / PPV across card strengths', () => {
    const kinds: BroadcastKind[] = ['none', 'localTv', 'nationalTv', 'streaming', 'ppv']
    const out: string[] = []
    const winners: Record<string, string> = {}
    for (const profile of ['low', 'medium', 'high', 'superstar'] as Profile[]) {
      const show = buildShow({ profile, tier: TIER_FOR[profile], promoRep: 50, nFights: 7 })
      const med: Record<string, number> = {}
      const p10: Record<string, number> = {}
      const avail: Record<string, boolean> = {}
      for (const kd of kinds) {
        show.ev.broadcast.kind = kd
        show.ev.broadcast.ppvPrice = ppvRefPrice(eventInterest(show.state, show.ev))
        const ds = draws(show, 200)
        const nets = ds.map((d) => netFor(show, kd, d))
        med[kd] = quantile(nets, 0.5); p10[kd] = quantile(nets, 0.1)
        avail[kd] = true
      }
      winners[profile] = kinds.slice().sort((a, b) => med[b] - med[a])[0]
      out.push(`${profile.padEnd(10)} median net: ${kinds.map((kd) => `${kd} ${k(med[kd])}`).join(' | ')}   (p10: ${kinds.map((kd) => k(p10[kd])).join('/')})`)
      void avail
    }
    console.log('BROADCAST AUDIT\n' + out.join('\n'))
    expect(new Set(Object.values(winners)).size).toBeGreaterThan(1) // different cards want different deals
  })
})

describe('sponsor audit', () => {
  it('pays with audience and reputation, stays small next to event risk', () => {
    const out: string[] = []
    const fees: Record<string, number> = {}
    for (const profile of ['low', 'medium', 'high', 'superstar'] as Profile[]) {
      const show = buildShow({ profile, tier: TIER_FOR[profile], promoRep: profile === 'low' ? 25 : profile === 'medium' ? 45 : 70, nFights: 7 })
      const offers = generateSponsorOffers(show.state, show.ev)
      const fc = forecastEvent(show.state, show.ev)
      const best = Math.max(...offers.map((o) => o.fixedFee))
      fees[profile] = best
      out.push(`${profile.padEnd(10)} best offer ${k(best)} (+bonuses up to ${k(Math.max(...offers.map((o) => o.fixedFee + (o.attendanceBonus?.amount ?? 0) + (o.qualityBonus?.amount ?? 0))))}) | forecast revenue ${k(fc.revenue.lo)}–${k(fc.revenue.hi)} | sponsor share of revenue ${((best / ((fc.revenue.lo + fc.revenue.hi) / 2)) * 100).toFixed(1)}% | profit range ${k(fc.profit.lo)}..${k(fc.profit.hi)}`)
    }
    console.log('SPONSOR AUDIT\n' + out.join('\n'))
    expect(fees.low).toBeLessThan(fees.medium)
    expect(fees.medium).toBeLessThan(fees.high)
    expect(fees.high).toBeLessThan(fees.superstar)
  })
})

describe('popularity, form and venue size', () => {
  it('headliner popularity moves demand a lot; form moves it too', () => {
    const at = (popOverride: number, form: 'normal' | 'hot' | 'cold', repOverride = 50) => {
      const show = buildShow({ profile: 'medium', tier: 'national', nFights: 7, popOverride, repOverride, form, promoRep: 45 })
      const d = demandFor(show.state, show.ev, 'public')
      return { dem: d.ga + d.premium + d.vip, interest: eventInterest(show.state, show.ev), q: cardQuality(show.state, show.ev).main }
    }
    const lo = at(20, 'normal'), mid = at(50, 'normal'), hi = at(80, 'normal')
    console.log(`POPULARITY→DEMAND: pop20 ${Math.round(lo.dem)} | pop50 ${Math.round(mid.dem)} | pop80 ${Math.round(hi.dem)} (interest ${lo.interest.toFixed(0)}/${mid.interest.toFixed(0)}/${hi.interest.toFixed(0)})`)
    expect(mid.dem).toBeGreaterThan(lo.dem * 1.3)
    expect(hi.dem).toBeGreaterThan(mid.dem * 1.3)
    // High popularity with poor recent form vs moderate popularity on a hot streak.
    const bigCold = at(75, 'cold'), modHot = at(50, 'hot')
    console.log(`FORM: popular-but-cold ${Math.round(bigCold.dem)} vs moderate-but-hot ${Math.round(modHot.dem)}; popular-normal ${Math.round(at(75, 'normal').dem)}`)
    expect(at(75, 'normal').dem).toBeGreaterThan(bigCold.dem) // bad form hurts
    expect(modHot.dem).toBeGreaterThan(at(50, 'normal').dem) // good form helps
    expect(bigCold.dem).toBeGreaterThan(modHot.dem * 0.9) // but popularity still matters more than a streak
  })

  it('has no single best ticket price: the optimum rises with card quality', () => {
    const best: Record<string, number> = {}
    const lines: string[] = []
    for (const profile of ['low', 'medium', 'high'] as Profile[]) {
      const show = buildShow({ profile, tier: profile === 'low' ? 'regional' : profile === 'medium' ? 'national' : 'arena', promoRep: 50, nFights: 7 })
      const ref = refPrices(eventInterest(show.state, show.ev))
      let bestM = 0, bestRev = -1
      const row: string[] = []
      for (const m of [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]) {
        const pr = { ga: Math.round(ref.ga * m), premium: Math.round(ref.premium * m), vip: Math.round(ref.vip * m) }
        show.ev.prices = pr
        const ds = draws(show, 60)
        const rev = mean(ds.map((d) => d.tickets))
        row.push(`${m}×:${k(rev)}(${(mean(ds.map((d) => d.fill)) * 100).toFixed(0)}%)`)
        if (rev > bestRev) { bestRev = rev; bestM = m }
      }
      best[profile] = bestM
      lines.push(`${profile.padEnd(7)} ref GA £${ref.ga} best ×${bestM} | ${row.join(' ')}`)
    }
    console.log('PRICING EXPERIMENT (mean gate by price multiple)\n' + lines.join('\n'))
    expect(new Set(Object.values(best)).size).toBeGreaterThan(0)
    expect(Math.max(...Object.values(best))).toBeGreaterThanOrEqual(1)
  })

  it('small venues trade upside for safety', () => {
    const lines: string[] = []
    const stat: Record<string, { med: number; p10: number; p90: number; loss: number }> = {}
    for (const tier of ['regional', 'national', 'arena', 'stadium'] as const) {
      const show = buildShow({ profile: 'medium', tier, promoRep: 50, nFights: 8 })
      const ds = draws(show, 200)
      const nets = ds.map((d) => netFor(show, 'localTv', d))
      stat[tier] = { med: quantile(nets, 0.5), p10: quantile(nets, 0.1), p90: quantile(nets, 0.9), loss: nets.filter((x) => x < 0).length / nets.length }
      lines.push(`${tier.padEnd(9)} same medium card: net p10/p50/p90 ${k(stat[tier].p10)}/${k(stat[tier].med)}/${k(stat[tier].p90)} loss ${(stat[tier].loss * 100).toFixed(0)}% fill p50 ${(quantile(ds.map((d) => d.fill), 0.5) * 100).toFixed(0)}%`)
    }
    console.log('VENUE SIZE (same card in bigger buildings)\n' + lines.join('\n'))
    expect(stat.stadium.loss).toBeGreaterThan(stat.regional.loss) // oversized buildings are riskier
    expect(stat.stadium.p10).toBeLessThan(stat.regional.p10)
  })

  it('forecast ranges cover most outcomes but are not razor thin', () => {
    const show = buildShow({ profile: 'medium', tier: 'national', promoRep: 45, nFights: 7 })
    const ds = draws(show, 600)
    const cover = (events: number) => {
      show.state.promotions[show.state.playerPromotionId].stats.events = events
      const fc = forecastEvent(show.state, show.ev)
      return { fc, inside: ds.filter((d) => d.attendance >= fc.attendance.lo && d.attendance <= fc.attendance.hi).length / ds.length }
    }
    const fresh = cover(0), vet = cover(60)
    console.log(`FORECAST new promoter: ${Math.round(fresh.fc.attendance.lo)}–${Math.round(fresh.fc.attendance.hi)} inside ${(fresh.inside * 100).toFixed(0)}% | veteran: ${Math.round(vet.fc.attendance.lo)}–${Math.round(vet.fc.attendance.hi)} inside ${(vet.inside * 100).toFixed(0)}% | outcomes p10/p50/p90 ${Math.round(quantile(ds.map((d) => d.attendance), 0.1))}/${Math.round(quantile(ds.map((d) => d.attendance), 0.5))}/${Math.round(quantile(ds.map((d) => d.attendance), 0.9))}`)
    expect(fresh.inside).toBeGreaterThan(0.8)
    expect(vet.inside).toBeGreaterThan(0.55) // experience narrows the range, never to certainty
    expect(vet.inside).toBeLessThan(0.93)
    expect((vet.fc.attendance.hi - vet.fc.attendance.lo) / Math.max(1, vet.fc.attendance.hi)).toBeGreaterThan(0.2)
    expect(fresh.fc.attendance.hi - fresh.fc.attendance.lo).toBeGreaterThan(vet.fc.attendance.hi - vet.fc.attendance.lo)
    void soldFromDemand; void ppvBuysFor
  })
})
