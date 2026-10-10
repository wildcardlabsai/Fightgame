/*
 * Title-vacancy audit (Phase 5.10): how long do belts sit vacant, by tier, body and division?
 * Usage: npx tsx scripts/audit/phase510-vacancy.ts [years=8] [seeds=6] [--first=1]
 * The player does nothing (a passive promotion), so only the world's own title ecosystem is measured.
 * A belt is "vacant" in a week when its record exists with no champion; belts with no record are "dormant" (not contested).
 */
import { createNewGame } from '../../src/engine/worldgen'
import { advanceOneWeek } from '../../src/engine/tick'
import { levelOf } from '../../src/engine/business/titleDefs'
import type { GameState } from '../../src/engine/types'

const years = Number(process.argv[2] ?? 8), seeds = Number(process.argv[3] ?? 6)
const first = Number(process.argv.find((a) => a.startsWith('--first='))?.split('=')[1] ?? 1)
const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0 }
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '-')

type Run = { key: string; level: string; len: number; open: boolean; seed: number; startWeek: number }
const runs: Run[] = []
const weeks: Record<string, { vacant: number; held: number; dormant: number }> = {}
const T0 = Date.now()
for (let seed = first; seed < first + seeds; seed++) {
  let s: GameState = createNewGame({ seed: `vac-${seed}`, promotionName: 'P', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo }, 1_700_000_000_000)
  const cur = new Map<string, Run>()
  const keys = new Set<string>()
  for (let w = 1; w <= years * 52; w++) {
    s = advanceOneWeek(s)
    const titles = s.media!.titles
    for (const k of Object.keys(titles)) keys.add(k)
    for (const k of keys) {
      const level = levelOf(k.split('|')[0])
      const t = (weeks[level] ??= { vacant: 0, held: 0, dormant: 0 })
      const rec = titles[k]
      if (!rec) { t.dormant++; continue }
      if (rec.c) { t.held++; const r = cur.get(k); if (r) { r.open = false; cur.delete(k) } continue }
      t.vacant++
      let r = cur.get(k)
      if (!r) { r = { key: k, level, len: 0, open: true, seed, startWeek: w }; cur.set(k, r); runs.push(r) }
      r.len++
    }
  }
}
console.log(`vacancy audit: ${seeds} seeds x ${years} years  (${Math.round((Date.now() - T0) / 1000)}s)`)
console.log('level      belt-weeks held vacant dormant  vacant%   episodes  median  p90   max  still-open')
for (const lvl of ['world', 'european', 'domestic', 'area']) {
  const t = weeks[lvl]; if (!t) continue
  const rs = runs.filter((r) => r.level === lvl).map((r) => r.len).sort((a, b) => a - b)
  const open = runs.filter((r) => r.level === lvl && r.open).length
  console.log(`${lvl.padEnd(10)} ${String(t.held + t.vacant + t.dormant).padStart(9)} ${String(t.held).padStart(5)} ${String(t.vacant).padStart(6)} ${String(t.dormant).padStart(7)} ${pct(t.vacant, t.held + t.vacant).padStart(8)} ${String(rs.length).padStart(10)} ${String(med(rs)).padStart(7)} ${String(rs[Math.floor(rs.length * 0.9)] ?? 0).padStart(5)} ${String(rs[rs.length - 1] ?? 0).padStart(5)} ${String(open).padStart(8)}`)
}
const longest = [...runs].sort((a, b) => b.len - a.len).slice(0, 12)
console.log('longest vacancies (weeks):')
for (const r of longest) console.log(`  ${r.key.padEnd(30)} ${r.level.padEnd(9)} ${String(r.len).padStart(4)} wk  seed ${r.seed} from week ${r.startWeek}${r.open ? '  (still vacant at end)' : ''}`)
const byBody: Record<string, number[]> = {}
for (const r of runs) (byBody[r.key.split('|')[0]] ??= []).push(r.len)
console.log('by body: ' + Object.entries(byBody).map(([b, l]) => `${b} n=${l.length} med=${med(l)} max=${Math.max(...l)}`).join(' | '))
