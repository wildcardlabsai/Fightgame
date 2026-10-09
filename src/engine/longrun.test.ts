import { describe, expect, it } from 'vitest'
import { isDefunct } from './world/lifecycle'
import { BALANCE as B } from './balance'
import { freeAgents, rosterOf } from './selectors'
import { advanceOneWeek } from './tick'
import { bestOf, median, now } from './benchTime'
import { createNewGame } from './worldgen'

const LONGRUN_LIMIT = 17.5

describe('eight-year world simulation (player passive)', () => {
  it('keeps the market healthy, rivals stocked and state size bounded', () => {
    let s = createNewGame({ seed: 'longrun', promotionName: 'L', promoterName: 'T', homeCountry: 'ENG', difficulty: 'forgiving', logo: { monogram: 'L', color: '#fff', emblem: 'bolt' } })
    const rows: string[] = []
    const refWorld = createNewGame({ seed: 'perf-ref', promotionName: 'Ref', promoterName: 'R', homeCountry: 'ENG', difficulty: 'standard', logo: { monogram: 'R', color: '#fff', emblem: 'bolt' } })
    const ref = () => { structuredClone(refWorld) }
    // Host-speed normalisation (see benchTime.ts): each simulated year is timed against a fixed reference workload measured around it.
    const yearMs: number[] = [], yearRatio: number[] = []
    let refBefore = bestOf(ref, 4)
    let t0 = now()
    let day0 = s.today
    for (let w = 1; w <= 52 * 8; w++) {
      s = advanceOneWeek(s)
      if (w % 52 === 0) {
        const y = w / 52
        const ms1 = (now() - t0) / 52
        const refAfter = bestOf(ref, 4)
        yearMs.push(ms1); yearRatio.push(ms1 / Math.min(refBefore, refAfter)); refBefore = refAfter
        const signed = Object.values(s.fighters).reduce((n, f) => n + f.history.filter((h) => h.kind === 'signed' && h.day > day0 && h.promotionId !== s.playerPromotionId).length, 0)
        day0 = s.today
        const retired = Object.values(s.fighters).filter((f) => f.status === 'retired').length
        const rosters = Object.values(s.promotions).filter((p) => !p.isPlayer).map((p) => rosterOf(s, p.id).length)
        rows.push(`y${y}: fighters ${Object.keys(s.fighters).length} retired ${retired} free ${freeAgents(s).length} rival-signings(yr) ${signed} rosters [${rosters.join(',')}] known ${Object.keys(s.knowledge).length} inbox ${s.inbox.length} saveKB ${(JSON.stringify(s).length / 1024).toFixed(0)}`)
        const free = freeAgents(s).length
        expect(free).toBeGreaterThan(60)
        expect(free).toBeLessThan(450)
        for (const p of Object.values(s.promotions)) {
          if (p.isPlayer) continue
          const n = rosterOf(s, p.id).length
          expect(n).toBeLessThanOrEqual(B.market.rosterCap[p.tier])
          // Phase 4.5: a rival in financial distress deliberately sheds fighters (see systems/aiFinance.ts), so the "stocked" floor
          // applies to every rival that is not struggling, critical or insolvent. Negative cash is only possible while distressed.
          const distressed = ['struggling', 'critical', 'insolvent'].includes(p.ai!.fin.state)
          // Phase 5.4B: a promotion founded within the last year is still building its roster, and one that has run out of money and fighters
          // (isDefunct) is no longer competing; neither is held to the floor.
          const building = s.today - p.foundedDay < 52 * 7 && p.foundedDay > s.startDay
          if (!distressed && !building && !isDefunct(s, p)) expect(n).toBeGreaterThanOrEqual(Math.floor(B.ai.rosterTarget[p.tier] * 0.5))
          expect(Number.isFinite(p.cash)).toBe(true)
          if (p.cash < 0) expect(distressed).toBe(true)
        }
        t0 = now()
      }
    }
    // Median over the eight years of (wall ms per week ÷ reference cost): robust to a noisy year and to host speed, still catches a real across-the-board slowdown.
    const ratio = median(yearRatio)
    console.log(rows.join('\n') + `\nmedian ${ratio.toFixed(1)}× reference (wall ms/week by year: ${yearMs.map((x) => x.toFixed(0)).join(', ')})`)
    expect(ratio).toBeLessThan(LONGRUN_LIMIT) // was 60 ms/week wall; ≈ 12× the reference clone on the reference host (~5 ms)
    expect(JSON.stringify(s).length).toBeLessThan(3_500_000) // fits comfortably in browser storage
    // Every strategy actually made signings over the years.
    for (const strat of ['traditional', 'prospectFactory', 'money', 'regional'] as const) {
      const promos = Object.values(s.promotions).filter((p) => p.ai?.strategy === strat)
      const signings = Object.values(s.fighters).reduce((n, f) => n + f.history.filter((h) => h.kind === 'signed' && promos.some((p) => p.id === h.promotionId)).length, 0)
      expect(signings, strat).toBeGreaterThan(5)
    }
    // Strategy character is visible in who they hold at the end.
    const avgAge = (strat: string) => {
      const ps = Object.values(s.promotions).filter((p) => p.ai?.strategy === strat)
      const ages = ps.flatMap((p) => rosterOf(s, p.id)).map((f) => (s.today - f.birthDay) / 365)
      return ages.reduce((a, b) => a + b, 0) / ages.length
    }
    console.log('avg roster age — prospectFactory', avgAge('prospectFactory').toFixed(1), '| traditional', avgAge('traditional').toFixed(1), '| money', avgAge('money').toFixed(1), '| regional', avgAge('regional').toFixed(1))
    expect(avgAge('prospectFactory')).toBeLessThan(avgAge('traditional'))
  }, 180_000)
})
