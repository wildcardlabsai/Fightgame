// Long-run ecosystem audit for Phase 5.4.  Usage: npx tsx scripts/audit/phase54-longrun.ts <years> [seed] [bot|passive]
import { auditWorld, worldMetrics } from '../../src/engine/business/audit'
import { advanceOneWeek } from '../../src/engine/tick'
import { createNewGame } from '../../src/engine/worldgen'
import { newLog, playWeek, STRATEGIES } from '../../src/engine/sim/strategies'
import { getList } from '../../src/engine/media/records'
import { SANCTIONING } from '../../src/engine/media/orgs'
import { WEIGHT_CLASSES } from '../../src/data/weightClasses'
import { serialiseGame } from '../../src/engine/save'
import type { GameState } from '../../src/engine/types'

const years = Number(process.argv[2] ?? 5)
const seed = process.argv[3] ?? 'p54-long'
const mode = process.argv[4] ?? 'bot'
const logo = { monogram: 'P', color: '#fff', emblem: 'bolt' as const }
let s: GameState = createNewGame({ seed, promotionName: 'Long Run', promoterName: 'T', homeCountry: 'ENG', difficulty: 'standard', logo, scenario: 'regional' }, 1_700_000_000_000)
const log = newLog()
const violations = new Map<string, number>()
let maxJump = 0
const prevRank = new Map<string, number>()
let ms = 0
const rows: string[] = []
let firstPurse = 0
for (let w = 1; w <= years * 52; w++) {
  const t0 = performance.now()
  if (mode === 'bot') s = playWeek(s, STRATEGIES.balanced, log)
  s = advanceOneWeek(s)
  ms += performance.now() - t0
  if (w % 4 === 0) {
    for (const v of auditWorld(s)) violations.set(v, (violations.get(v) ?? 0) + 1)
    // Rank jumps on the sanctioning lists between consecutive checks.
    for (const o of SANCTIONING) for (const wc of WEIGHT_CLASSES) {
      const l = getList(s.media!, o.id, wc.id)
      if (!l) continue
      for (const e of l.e) { if (e.r === 0) continue; const k = `${o.id}|${wc.id}|${e.f}`; const p = prevRank.get(k); if (p !== undefined && p > 0) maxJump = Math.max(maxJump, Math.abs(p - e.r)); prevRank.set(k, e.r) }
    }
  }
  if (w % 52 === 0) {
    const m = worldMetrics(s)
    if (!firstPurse) firstPurse = m.medianPurse
    const promos = Object.values(s.promotions).filter((p) => !p.isPlayer)
    const insolvent = promos.filter((p) => p.ai?.fin.state === 'insolvent' || p.ai?.fin.collapsing).length
    rows.push(`y${w / 52} ${(ms / 52).toFixed(1)}ms/wk fighters ${Object.keys(s.fighters).length} active ${m.active} champs ${m.champions} (${(m.championShare * 100).toFixed(1)}%) everChamp ${m.everChampion} titleFights ${(m.titleFightShare * 100).toFixed(0)}% medianPurse £${m.medianPurse} (x${(m.medianPurse / firstPurse).toFixed(2)}) rivalsInsolvent ${insolvent}/${promos.length} avgRivalCash £${Math.round(promos.reduce((a, p) => a + p.cash, 0) / promos.length / 1000)}k retiredChamps ${m.retiredChampions}`)
    ms = 0
  }
}
console.log(rows.join('\n'))
console.log(`save ${(serialiseGame(s).length / 1024).toFixed(0)} kB; media ${(JSON.stringify(s.media).length / 1024).toFixed(0)} kB; max rank jump ${maxJump}`)
const venuesUsed = new Set(Object.values(s.events).map((e) => e.venueId)).size
console.log(`events ${Object.keys(s.events).length} venues used ${venuesUsed}`)
console.log(violations.size === 0 ? `AUDIT CLEAN over ${years} years (${seed}, ${mode})` : `AUDIT VIOLATIONS (${violations.size} kinds):\n` + [...violations].slice(0, 20).map(([k, n]) => `  x${n} ${k}`).join('\n'))
