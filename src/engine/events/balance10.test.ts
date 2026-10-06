/**
 * TEN-YEAR ECONOMIC BALANCE RUN. A scripted promoter (events/bot.ts) plays ten years through the public commands while the
 * AI world runs its own shows. Prints the metrics in docs/BALANCE.md and asserts the economy stays sane.
 */
import { describe, expect, it } from 'vitest'
import { totalCosts, totalRevenue } from '../eventFinance'
import { financialHealth, player } from '../selectors'
import { advanceOneWeek } from '../tick'
import { createNewGame } from '../worldgen'
import { botManage, newBotLog } from './bot'

describe('ten-year economy', () => {
  it('lets a sensible promoter grow, keeps AI books honest, and stays compact', () => {
    let s = createNewGame({ seed: 'balance10', promotionName: 'Bot', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo: { monogram: 'B', color: '#fff', emblem: 'bolt' } })
    const log = newBotLog()
    const cash: number[] = []
    let maxSave = 0
    let engineMs = 0
    for (let w = 0; w < 520; w++) {
      s = botManage(s, log)
      const t1 = performance.now()
      s = advanceOneWeek(s)
      engineMs += performance.now() - t1
      if (w % 52 === 51) { cash.push(Math.round(player(s).cash / 1000)); maxSave = Math.max(maxSave, JSON.stringify(s).length) }
    }
    const ms = engineMs / 520
    const mine = Object.values(s.events).filter((e) => e.promotionId === s.playerPromotionId && e.result)
    const ai = Object.values(s.events).filter((e) => e.kind === 'ai')
    const aiDone = ai.filter((e) => e.result)
    const by: Record<string, { n: number; profit: number; fill: number; loss: number }> = {}
    for (const sh of log.shows) { const t = (by[sh.tier] ??= { n: 0, profit: 0, fill: 0, loss: 0 }); t.n++; t.profit += sh.profit; t.fill += sh.fill; if (sh.profit < 0) t.loss++ }
    const aiLoss = aiDone.filter((e) => e.result!.profit < 0).length
    const aiFill = aiDone.reduce((n, e) => n + e.result!.attendance / s.venues[e.venueId].capacity, 0) / Math.max(1, aiDone.length)
    const bail = Object.values(s.promotions).filter((p) => !p.isPlayer).reduce((n, p) => n + (p.accounting?.bailouts ?? 0), 0)
    const ppv = mine.filter((e) => e.broadcast.kind === 'ppv').length
    console.log([
      `PLAYER: ${log.shows.length} shows (${(log.shows.length / 10).toFixed(1)}/yr), cancelled ${log.cancelled}, cash by year (k) ${cash.join(', ')}, reputation ${player(s).reputation.toFixed(0)}, fans ${player(s).fanbase}, health ${financialHealth(s).state}`,
      ...Object.entries(by).map(([k, t]) => `  ${k}: n${t.n} avg profit ${Math.round(t.profit / t.n / 1000)}k fill ${(t.fill / t.n * 100).toFixed(0)}% losses ${t.loss}`),
      `PLAYER event totals: revenue ${Math.round(mine.reduce((n, e) => n + totalRevenue(e.finance), 0) / 1000)}k costs ${Math.round(mine.reduce((n, e) => n + totalCosts(e.finance), 0) / 1000)}k PPV shows ${ppv}`,
      `AI: ${ai.length} events (${aiDone.length} settled, ${ai.filter((e) => e.status === 'cancelled').length} cancelled), loss-making ${(aiLoss / Math.max(1, aiDone.length) * 100).toFixed(0)}%, mean fill ${(aiFill * 100).toFixed(0)}%, bailouts £${Math.round(bail / 1000)}k`,
      `PERF engine ${ms.toFixed(1)} ms/week | max save ${(maxSave / 1024).toFixed(0)} kB | events stored ${Object.keys(s.events).length} | fights stored ${Object.keys(s.fights).length}`,
    ].join('\n'))

    expect(log.shows.length).toBeGreaterThan(25)
    expect(player(s).cash).toBeGreaterThan(500_000) // a sensible promoter ends up ahead of the starting capital
    expect(s.ledgerArchive + s.ledger.reduce((a, t) => a + t.amount, 0)).toBe(player(s).cash)
    expect(by.local?.n ?? 0).toBeLessThan(log.shows.length) // the bot moves up the ladder
    expect(aiLoss / Math.max(1, aiDone.length)).toBeGreaterThan(0) // not every rival show is a winner…
    expect(aiLoss / Math.max(1, aiDone.length)).toBeLessThan(0.5) // …and most are
    for (const p of Object.values(s.promotions).filter((x) => !x.isPlayer)) {
      const a = p.accounting!
      expect(p.cash).toBe(Math.round(a.startCash + a.revenue - a.costs - a.overhead + a.bailouts))
    }
    const seen = new Set<string>()
    for (const e of Object.values(s.events)) { if (e.status === 'cancelled') continue; const k = `${e.venueId}:${e.day}`; expect(seen.has(k)).toBe(false); seen.add(k) }
    expect(maxSave).toBeLessThan(6_000_000)
    expect(ms).toBeLessThan(90)
  }, 900000)
})
