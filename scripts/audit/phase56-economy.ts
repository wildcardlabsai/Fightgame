/*
 * Player-economy audit (Phase 5.6): how a promotion earns, spends and loses its roster over a long career, per policy and stress scenario.
 * Usage: npx tsx scripts/audit/phase56-economy.ts <policy> [years=8] [seeds=8] [--first=1] [--stress=none|zero|lowcash|negative|cut]
 *   policy: passive | conservative | balanced | aggressive | prospects | superstar | <any name added in strategies>
 * Stress is applied at the start of year 2: zero (release the whole roster), lowcash (cash set to 60k), negative (cash set to -150k).
 */
import { createNewGame } from '../../src/engine/worldgen'
import { advanceOneWeek } from '../../src/engine/tick'
import { newLog, playWeek, STRATEGIES } from '../../src/engine/sim/strategies'
import { releaseFighter } from '../../src/engine/commands'
import { post } from '../../src/engine/ledger'
import { weeklyBurn, playerRoster } from '../../src/engine/selectors'
import type { GameState } from '../../src/engine/types'

const policy = process.argv[2] ?? 'balanced'
const years = Number(process.argv[3] ?? 8), seeds = Number(process.argv[4] ?? 8)
const first = Number(process.argv.find((a) => a.startsWith('--first='))?.split('=')[1] ?? 1)
const stress = process.argv.find((a) => a.startsWith('--stress='))?.split('=')[1] ?? 'none'
const strat = STRATEGIES[policy] ?? null
const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0 }
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0 }
const k = (n: number) => `${Math.round(n / 1000)}k`

interface Run { cash: number[]; roster: number[]; shows: number[]; showProfit: number[]; income: Record<string, number>; expense: Record<string, number>; dep: Record<string, number>; signed: number; zeroWeeks: number; firstZero: number | null; recoveredAt: number | null; neg: number; closed: number | null; fixedYear: number[] }
const runs: Run[] = []
const T0 = Date.now()
for (let seed = first; seed < first + seeds; seed++) {
  let s: GameState = createNewGame({ seed: `eco-${seed}`, promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
  const log = newLog()
  const r: Run = { cash: [], roster: [], shows: [], showProfit: [], income: {}, expense: {}, dep: {}, signed: 0, zeroWeeks: 0, firstZero: null, recoveredAt: null, neg: 0, closed: null, fixedYear: [] }
  let seen = new Set<string>(), prevRoster = new Set<string>(), showsBefore = 0
  for (let w = 1; w <= years * 52; w++) {
    if (w === 53 && stress !== 'none') {
      if (stress === 'zero') for (const f of playerRoster(s)) { const x = releaseFighter(s, f.id); if (x.ok) s = x.state }
      if (stress === 'lowcash') post(s, 'other', 60_000 - s.promotions[s.playerPromotionId].cash, 'Stress: cash set')
      if (stress === 'negative') post(s, 'other', -150_000 - s.promotions[s.playerPromotionId].cash, 'Stress: cash set')
    }
    if (strat) s = playWeek(s, strat, log)
    s = advanceOneWeek(s)
    const cash = s.promotions[s.playerPromotionId].cash
    const ro = playerRoster(s)
    if (cash < 0) r.neg++
    if (ro.length === 0) { r.zeroWeeks++; if (r.firstZero === null) r.firstZero = w } else if (r.firstZero !== null && r.recoveredAt === null && ro.length >= 3) r.recoveredAt = w
    const ids = new Set(ro.map((f) => f.id))
    for (const id of prevRoster) if (!ids.has(id)) {
      const c = s.contractHistory.find((x) => x.fighterId === id && x.promotionId === s.playerPromotionId)
      const f = s.fighters[id]
      const why = f?.status === 'retired' ? 'retired' : c?.status === 'released' ? 'released' : c?.status === 'expired' ? (f?.contractId ? 'left for a rival' : 'expired, unsigned') : (c?.status ?? 'other')
      r.dep[why] = (r.dep[why] ?? 0) + 1
    }
    prevRoster = ids
    for (const t of s.ledger) { if (seen.has(t.id)) continue; seen.add(t.id); const m = t.amount >= 0 ? r.income : r.expense; m[t.category] = (m[t.category] ?? 0) + t.amount }
    if (seen.size > 6000) seen = new Set([...seen].slice(-3000))
    if (w % 52 === 0) {
      r.cash.push(cash); r.roster.push(ro.length)
      const sh = Object.values(s.events).filter((e) => e.promotionId === s.playerPromotionId && e.result).length
      r.shows.push(sh - showsBefore); showsBefore = sh
      r.fixedYear.push(weeklyBurn(s).overheads * 52)
    }
  }
  r.signed = log.signed
  for (const sh of log.shows) r.showProfit.push(sh.profit)
  runs.push(r)
}
if (process.argv.includes('--per-seed')) runs.forEach((r, i) => console.log(`  seed ${first + i}: cash ${r.cash.map(k).join(' ')} | roster ${r.roster.join(' ')} | shows ${r.shows.join(' ')} | profit/show median ${k(med(r.showProfit))} loss-making ${r.showProfit.length ? Math.round((100 * r.showProfit.filter((x) => x < 0).length) / r.showProfit.length) : 0}% | departures ${JSON.stringify(r.dep)} | signed ${r.signed}`))
const solvent = runs.filter((r) => r.cash[r.cash.length - 1] > 0).length
console.log(`Economy audit: policy ${policy}${strat ? '' : ' (no actions)'}, stress ${stress}, ${seeds} seeds x ${years} years`)
console.log(`  solvent at end: ${solvent}/${seeds}; ever negative: ${runs.filter((r) => r.neg > 0).length}/${seeds}; negative weeks (median) ${med(runs.map((r) => r.neg))}`)
for (let y = 0; y < years; y++) console.log(`  y${y + 1}: cash median ${k(med(runs.map((r) => r.cash[y])))} [${k(Math.min(...runs.map((r) => r.cash[y])))} .. ${k(Math.max(...runs.map((r) => r.cash[y])))}]  roster median ${med(runs.map((r) => r.roster[y]))} (min ${Math.min(...runs.map((r) => r.roster[y]))})  shows ${med(runs.map((r) => r.shows[y]))}  fixed overhead ${k(med(runs.map((r) => r.fixedYear[y])))}`)
const sp = runs.flatMap((r) => r.showProfit)
console.log(`  shows run: ${sp.length} (per run median ${med(runs.map((r) => r.showProfit.length))}); profit p10 ${k(q(sp, 0.1))} median ${k(med(sp))} p90 ${k(q(sp, 0.9))}; loss-making ${sp.length ? Math.round((100 * sp.filter((x) => x < 0).length) / sp.length) : 0}%`)
const sum = (m: 'income' | 'expense') => { const t: Record<string, number> = {}; for (const r of runs) for (const [c, v] of Object.entries(r[m])) t[c] = (t[c] ?? 0) + v / seeds / years; return Object.entries(t).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 9).map(([c, v]) => `${c} ${k(v)}`).join(', ') }
console.log(`  per seed-year income: ${sum('income')}`)
console.log(`  per seed-year expense: ${sum('expense')}`)
const dep: Record<string, number> = {}; for (const r of runs) for (const [c, v] of Object.entries(r.dep)) dep[c] = (dep[c] ?? 0) + v
console.log(`  departures per seed-year: ${Object.entries(dep).map(([c, v]) => `${c} ${(v / seeds / years).toFixed(1)}`).join(', ')}; signings by the policy ${(runs.reduce((n, r) => n + r.signed, 0) / seeds / years).toFixed(1)}`)
console.log(`  zero-roster: ${runs.filter((r) => r.firstZero !== null).length}/${seeds} runs hit it (first at week ${runs.filter((r) => r.firstZero !== null).map((r) => r.firstZero).join(',') || '-'}); recovered ${runs.filter((r) => r.recoveredAt !== null).length}; zero-roster weeks median ${med(runs.map((r) => r.zeroWeeks))}`)
console.log(`wall ${((Date.now() - T0) / 1000).toFixed(0)}s`)
