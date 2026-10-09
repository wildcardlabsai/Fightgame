/*
 * Fight-night consequences audit (Phase 5.4D): what a result does to the fighters, and how careers end, over several seeds and years.
 * Usage: npx tsx scripts/audit/phase54d-consequences.ts [years=10] [seeds=6] [--bot]
 */
import { advanceOneWeek } from '../../src/engine/tick'
import { createNewGame } from '../../src/engine/worldgen'
import { newLog, playWeek, STRATEGIES } from '../../src/engine/sim/strategies'
import { fighterAge, fighterRating } from '../../src/engine/fighters'
import type { Fighter, GameState } from '../../src/engine/types'

const years = Number(process.argv[2] ?? 10), seeds = Number(process.argv[3] ?? 6)
const bot = process.argv.includes('--bot')
const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const tot: Record<string, number> = {}
const add = (k: string, v = 1) => (tot[k] = (tot[k] ?? 0) + v)
const stageOf = (f: Fighter, today: number) => { const age = fighterAge(f, today), n = f.record.wins + f.record.losses + f.record.draws; return age >= 33 ? 'veteran' : n <= 12 ? 'prospect' : 'prime' }
const cells: Record<string, { n: number; rep: number; pop: number }> = {}
const T0 = Date.now()
const retAges: number[] = [], retRatings: number[] = [], retLosses: number[] = []
for (let k = 1; k <= seeds; k++) {
  let s: GameState = createNewGame({ seed: `cons-${k}`, promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
  const log = newLog()
  const seen = new Set<string>(), retSeen = new Set<string>()
  const seenOffers = new Set<string>()
  for (let w = 1; w <= years * 52; w++) {
    if (bot) s = playWeek(s, STRATEGIES.balanced, log)
    s = advanceOneWeek(s)
    for (const f of Object.values(s.fights)) {
      if (!f.result || f.status !== 'postFight' || seen.has(f.id)) continue
      seen.add(f.id); add('fights')
      const r = f.result
      for (const i of [0, 1] as const) {
        const x = s.fighters[i === 0 ? f.sideA.fighterId : f.sideB.fighterId]; if (!x) continue
        const pWin = i === 0 ? r.pExpA : 1 - r.pExpA
        const res = r.winner === null ? 'draw' : r.winner === i ? 'win' : 'loss'
        const band = res === 'win' ? (pWin < 0.35 ? 'upset' : pWin > 0.65 ? 'expected' : 'even') : res === 'loss' ? (pWin > 0.65 ? 'shock' : pWin < 0.35 ? 'expected' : 'even') : 'draw'
        const key = `${stageOf(x, f.day)}|${res}|${band}`
        const c = (cells[key] ??= { n: 0, rep: 0, pop: 0 }); c.n++; c.rep += r.dRep[i]; c.pop += r.dPop[i]
      }
    }
    for (const f of Object.values(s.fighters)) {
      if (f.status === 'retired' && !retSeen.has(f.id) && f.retiredDay !== null && f.retiredDay >= s.today - 7) {
        retSeen.add(f.id); add('retired')
        const age = fighterAge(f, s.today); retAges.push(age); retRatings.push(fighterRating(f)); retLosses.push(f.record.losses)
        if (age < 35 && fighterRating(f) >= 60) add('retired.young.good')
        const last = f.recentFights.map((id) => s.fights[id]).filter((x) => x?.result).slice(-4)
        const lostAll = last.length >= 4 && last.every((x) => { const side = x.sideA.fighterId === f.id ? 0 : 1; return x.result!.winner === 1 - side })
        if (lostAll) add('retired.after4losses')
      }
    }
    if (w % 26 === 0) {
      for (const f of Object.values(s.fighters)) {
        if (f.status !== 'active') continue
        const idle = f.lastFightDay === null ? 999 : (s.today - f.lastFightDay) / 7
        const n = f.record.wins + f.record.losses + f.record.draws
        if (idle > 78 && n > 3) add('zombie.active.idle78w')
        if (fighterAge(f, s.today) >= 38) add('active.age38+')
        const rec = f.recentFights.map((id) => s.fights[id]).filter((x) => x?.result).slice(-5)
        const losing = rec.length >= 5 && rec.every((x) => { const side = x.sideA.fighterId === f.id ? 0 : 1; return x.result!.winner === 1 - side })
        if (losing) add('active.lost5straight')
        add('active.samples')
      }
    }
    if (bot && s.office) for (const o of Object.values(s.office.offers)) {
      if (seenOffers.has(o.id)) continue
      seenOffers.add(o.id)
      const f = s.fighters[o.mine]; if (!f) continue
      const roster = Object.values(s.contracts).filter((c) => c.promotionId === s.playerPromotionId && c.status === 'active').map((c) => s.fighters[c.fighterId])
      const mean = roster.reduce((n, x) => n + x.momentum, 0) / Math.max(1, roster.length)
      add('offer.n'); add('offer.momentum', f.momentum); add('offer.rosterMomentum', mean)
    }
  }
}
const mean = (a: number[]) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : 'n/a'
console.log(`Consequence audit: ${seeds} seeds x ${years} years ${bot ? '(balanced bot)' : '(passive)'}`)
for (const k of Object.keys(tot).sort()) console.log(`  ${k}: ${tot[k]}`)
console.log(`  retirement age mean ${mean(retAges)} min ${Math.min(...retAges)} max ${Math.max(...retAges)}; rating mean ${mean(retRatings)}; losses mean ${mean(retLosses)}`)
if (tot['offer.n']) console.log(`  offers: target momentum ${(tot['offer.momentum'] / tot['offer.n']).toFixed(1)} vs roster ${(tot['offer.rosterMomentum'] / tot['offer.n']).toFixed(1)}`)
console.log('  stage|result|band           n   dRep   dPop')
for (const [k, c] of Object.entries(cells).sort()) if (c.n >= 15) console.log(`  ${k.padEnd(26)} ${String(c.n).padStart(4)} ${(c.rep / c.n).toFixed(1).padStart(6)} ${(c.pop / c.n).toFixed(1).padStart(6)}`)
console.log(`wall ${((Date.now() - T0) / 1000).toFixed(0)}s`)
