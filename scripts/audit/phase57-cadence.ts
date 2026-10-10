/*
 * Show-cadence audit (Phase 5.7): why does a promotion that starts healthy stop staging shows?
 * Usage: npx tsx scripts/audit/phase57-cadence.ts <policy> [years=8] [seeds=8] [--first=1] [--per-seed]
 * Per year, per seed: shows planned / completed / cancelled, the reason a week produced no show (the bot's own trace), roster, utilisation, profit, cash.
 */
import { createNewGame } from '../../src/engine/worldgen'
import { advanceOneWeek } from '../../src/engine/tick'
import { newLog, playWeek, STRATEGIES } from '../../src/engine/sim/strategies'
import { playerRoster, weeklyBurn } from '../../src/engine/selectors'
import type { GameState } from '../../src/engine/types'
import { BALANCE } from '../../src/engine/balance'
// Phase 6.1 comparison switches (environment, so the default run is the shipped configuration): P61_FILL=0 turns independents-on-cards off; P61_SCALE=x sets the AI show-planning interval scale.
if (process.env.P61_FILL === '0') (BALANCE.fights.ai as { freeAgentFill: boolean }).freeAgentFill = false
if (process.env.P61_RESCUE) (BALANCE.fights.ai as { freeAgentRescue: boolean }).freeAgentRescue = process.env.P61_RESCUE === '1'
if (process.env.P61_SHARE) (BALANCE.fights.ai as { freeAgentCardShare: number }).freeAgentCardShare = Number(process.env.P61_SHARE)
if (process.env.P61_SCALE) (BALANCE.events.ai as { cadenceScale: number }).cadenceScale = Number(process.env.P61_SCALE)

const policy = process.argv[2] ?? 'balanced'
const years = Number(process.argv[3] ?? 8), seeds = Number(process.argv[4] ?? 8)
const first = Number(process.argv.find((a) => a.startsWith('--first='))?.split('=')[1] ?? 1)
const perSeed = process.argv.includes('--per-seed')
const strat = STRATEGIES[policy]
if (!strat) throw new Error(`unknown policy ${policy}`)
const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0 }
const k = (n: number) => `${Math.round(n / 1000)}k`

interface Yr { done: number; profits: number[]; cash: number; roster: number; fights: number; planned: number; cancelled: number; overhead: number; retainers: number; negWeeks: number }
const all: { seed: number; yrs: Yr[]; trace: Record<string, number> }[] = []
const T0 = Date.now()
for (let seed = first; seed < first + seeds; seed++) {
  let s: GameState = createNewGame({ seed: `eco-${seed}`, promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
  const log = newLog()
  const yrs: Yr[] = []
  let rosterSum = 0, wk = 0, neg = 0
  const seenFights = new Set<string>(), seenEv = new Set<string>()
  let doneY = 0, fightsY = 0, profY: number[] = [], canY = 0, planPrev = 0
  for (let w = 1; w <= years * 52; w++) {
    s = playWeek(s, strat, log); s = advanceOneWeek(s)
    const ro = playerRoster(s).length; rosterSum += ro; wk++
    if (s.promotions[s.playerPromotionId].cash < 0) neg++
    for (const ev of Object.values(s.events)) {
      if (ev.promotionId !== s.playerPromotionId || seenEv.has(ev.id)) continue
      if (ev.result) { seenEv.add(ev.id); doneY++; profY.push(ev.result.profit) } else if (ev.status === 'cancelled') { seenEv.add(ev.id); canY++ }
    }
    for (const f of Object.values(s.fights)) if (f.result && !seenFights.has(f.id) && f.status === 'postFight' && (f.sideA.promotionId === s.playerPromotionId || f.sideB.promotionId === s.playerPromotionId)) { seenFights.add(f.id); fightsY++ }
    if (w % 52 === 0) {
      const planned = Object.entries(log.trace).filter(([key]) => key === `y${w / 52}:planned`).reduce((n, [, v]) => n + v, 0)
      yrs.push({ done: doneY, profits: profY, cash: s.promotions[s.playerPromotionId].cash, roster: ro, fights: fightsY, planned: planned - planPrev * 0, cancelled: canY, overhead: weeklyBurn(s).overheads * 52, retainers: weeklyBurn(s).retainers * 52, negWeeks: neg })
      doneY = 0; fightsY = 0; profY = []; canY = 0; rosterSum = 0; wk = 0; neg = 0
    }
  }
  all.push({ seed, yrs, trace: log.trace })
}
console.log(`Cadence audit: ${policy}, ${seeds} seeds x ${years} years`)
for (let y = 0; y < years; y++) {
  const col = all.map((r) => r.yrs[y])
  const profits = col.flatMap((c) => c.profits)
  console.log(`  y${y + 1}: shows done median ${med(col.map((c) => c.done))} [${Math.min(...col.map((c) => c.done))}..${Math.max(...col.map((c) => c.done))}], planned ${med(col.map((c) => c.planned))}, cancelled ${col.reduce((n, c) => n + c.cancelled, 0)}; profit/show median ${k(med(profits))}; fights per fighter ${(med(col.map((c) => c.fights / Math.max(1, c.roster)))).toFixed(1)}; roster ${med(col.map((c) => c.roster))}; overhead ${k(med(col.map((c) => c.overhead)))} retainers ${k(med(col.map((c) => c.retainers)))}; cash ${k(med(col.map((c) => c.cash)))} [${k(Math.min(...col.map((c) => c.cash)))}..${k(Math.max(...col.map((c) => c.cash)))}]`)
}
console.log(`  solvent at end ${all.filter((r) => r.yrs[years - 1].cash > 0).length}/${seeds}`)
// the reason weeks produced no show, summed over seeds, by year
const keys = [...new Set(all.flatMap((r) => Object.keys(r.trace).map((x) => x.split(':')[1])))].sort()
console.log('  weeks by outcome (all seeds), by year:')
for (const key of keys) console.log(`    ${key.padEnd(30)} ${Array.from({ length: years }, (_, y) => String(all.reduce((n, r) => n + (r.trace[`y${y + 1}:${key}`] ?? 0), 0)).padStart(5)).join('')}`)
if (perSeed) for (const r of all) console.log(`  seed ${r.seed}: done ${r.yrs.map((c) => c.done).join(' ')} | cash ${r.yrs.map((c) => k(c.cash)).join(' ')} | roster ${r.yrs.map((c) => c.roster).join(' ')} | profit/show ${r.yrs.map((c) => k(med(c.profits))).join(' ')}`)
console.log(`wall ${((Date.now() - T0) / 1000).toFixed(0)}s`)
